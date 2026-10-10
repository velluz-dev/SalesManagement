import { z } from 'zod';
import { TARGET_PERIOD_TYPES } from '@crm/shared';
import { prisma, Prisma, type Db } from '../../lib/prisma';
import { scopeFor, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { pageArgs, paged, paginationQuery } from '../../lib/pagination';
import { endOfDay, periodBounds } from '../../lib/dates';
import { getSetting } from '../../lib/settings';
import { money, optionalText, uuid } from '../../lib/validation';

export const listTargetsQuery = paginationQuery.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  periodType: z.enum(TARGET_PERIOD_TYPES).optional(),
  userId: uuid.optional(),
  teamId: uuid.optional(),
  current: z.enum(['true', 'false']).optional(),
});

export const targetSchema = z
  .strictObject({
    userId: uuid.optional().nullable(),
    teamId: uuid.optional().nullable(),
    periodType: z.enum(TARGET_PERIOD_TYPES),
    year: z.coerce.number().int().min(2000).max(2100),
    period: z.coerce.number().int().min(1).max(12).default(1),
    amount: money,
    notes: optionalText(1000),
  })
  .refine((v) => !!v.userId !== !!v.teamId, { message: 'Choose either a salesperson or a team', path: ['userId'] })
  .refine((v) => v.periodType !== 'QUARTER' || v.period <= 4, { message: 'Quarter must be 1–4', path: ['period'] });

export function targetScopeWhere(actor: Actor): Prisma.SalesTargetWhereInput {
  const scope = scopeFor(actor, 'target');
  if (scope === 'all') return {};
  if (scope === 'team') return { OR: [{ userId: { in: actor.teamMemberIds } }, { teamId: { in: actor.managedTeamIds } }] };
  return { userId: actor.user.id };
}

/** Actual achievement for a set of users in a period, using the configured basis (rule B11). */
export async function achievedAmount(db: Db, userIds: string[], start: Date, end: Date): Promise<Prisma.Decimal> {
  if (!userIds.length) return new Prisma.Decimal(0);
  const basis = await getSetting(db, 'targets.achievementBasis');
  if (basis === 'INVOICED') {
    const r = await db.invoice.aggregate({
      _sum: { total: true },
      where: { salespersonId: { in: userIds }, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] }, issueDate: { gte: start, lte: end } },
    });
    return r._sum.total ?? new Prisma.Decimal(0);
  }
  const r = await db.opportunity.aggregate({
    _sum: { amount: true },
    where: { ownerId: { in: userIds }, stage: 'CLOSED_WON', closedAt: { gte: start, lte: endOfDay(end) } },
  });
  return r._sum.amount ?? new Prisma.Decimal(0);
}

const include = {
  user: { select: { id: true, name: true } },
  team: { select: { id: true, name: true, members: { select: { id: true } } } },
  setBy: { select: { id: true, name: true } },
} satisfies Prisma.SalesTargetInclude;

type TargetRow = Prisma.SalesTargetGetPayload<{ include: typeof include }>;

export async function withProgress(db: Db, t: TargetRow) {
  const userIds = t.userId ? [t.userId] : (t.team?.members.map((m) => m.id) ?? []);
  const achieved = await achievedAmount(db, userIds, t.periodStart, t.periodEnd);
  const percent = t.amount.gt(0) ? Number(achieved.div(t.amount).mul(100).toFixed(1)) : 0;
  const { team, ...rest } = t;
  return { ...rest, team: team ? { id: team.id, name: team.name } : null, achieved: achieved.toFixed(2), percent };
}

export async function listTargets(actor: Actor, q: z.infer<typeof listTargetsQuery>) {
  const today = new Date();
  const where: Prisma.SalesTargetWhereInput = {
    AND: [
      targetScopeWhere(actor),
      q.year ? { periodStart: { gte: new Date(Date.UTC(q.year, 0, 1)), lte: new Date(Date.UTC(q.year, 11, 31)) } } : {},
      q.periodType ? { periodType: q.periodType } : {},
      q.userId ? { userId: q.userId } : {},
      q.teamId ? { teamId: q.teamId } : {},
      q.current === 'true' ? { periodStart: { lte: today }, periodEnd: { gte: new Date(today.toISOString().slice(0, 10)) } } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.salesTarget.findMany({ where, include, orderBy: [{ periodStart: q.order }, { createdAt: 'desc' }], ...pageArgs(q) }),
    prisma.salesTarget.count({ where }),
  ]);
  return paged(await Promise.all(rows.map((r) => withProgress(prisma, r))), total, q);
}

/** Target setters may only target their own teams/team members (or anyone with company-wide scope), never themselves. */
async function assertCanManage(db: Db, actor: Actor, input: { userId?: string | null; teamId?: string | null }) {
  const scope = scopeFor(actor, 'target');
  if (input.userId === actor.user.id) throw forbidden('You cannot set your own sales target');
  if (input.userId) {
    const u = await db.user.findUnique({ where: { id: input.userId }, select: { isActive: true } });
    if (!u?.isActive) throw badRequest('Salesperson not found');
    if (scope !== 'all' && !actor.teamMemberIds.includes(input.userId)) throw forbidden('You can only set targets for your team members');
  }
  if (input.teamId) {
    const t = await db.team.findUnique({ where: { id: input.teamId } });
    if (!t) throw badRequest('Team not found');
    if (scope !== 'all' && !actor.managedTeamIds.includes(input.teamId)) throw forbidden('You can only set targets for teams you manage');
  }
}

export async function upsertTarget(actor: Actor, input: z.infer<typeof targetSchema>, id?: string) {
  const { start, end } = periodBounds(input.periodType, input.year, input.periodType === 'YEAR' ? 1 : input.period);
  return prisma.$transaction(async (tx) => {
    await assertCanManage(tx, actor, input);
    const data = {
      userId: input.userId ?? null,
      teamId: input.teamId ?? null,
      periodType: input.periodType,
      periodStart: start,
      periodEnd: end,
      amount: input.amount,
      notes: input.notes ?? null,
      setById: actor.user.id,
    };
    let before = null;
    if (id) {
      before = await tx.salesTarget.findFirst({ where: { id, ...targetScopeWhere(actor) } });
      if (!before) throw notFound('Target');
      await assertCanManage(tx, actor, before);
    }
    const t = id
      ? await tx.salesTarget.update({ where: { id }, data, include })
      : await tx.salesTarget.create({ data, include });
    await audit(tx, actor, { action: id ? 'target.updated' : 'target.created', entityType: 'SalesTarget', entityId: t.id, before, after: data });
    const recipients = t.userId ? [t.userId] : (t.team?.members.map((m) => m.id) ?? []);
    await notify(tx, recipients, {
      type: 'TARGET_SET',
      title: 'Sales target updated',
      message: `${actor.user.name} set a ${input.periodType.toLowerCase()} target of ${input.amount} starting ${start.toISOString().slice(0, 10)}`,
      link: '/targets',
    });
    return withProgress(tx, t);
  });
}

export async function deleteTarget(actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.salesTarget.findFirst({ where: { id, ...targetScopeWhere(actor) } });
    if (!before) throw notFound('Target');
    await assertCanManage(tx, actor, before);
    await tx.salesTarget.delete({ where: { id } });
    await audit(tx, actor, { action: 'target.deleted', entityType: 'SalesTarget', entityId: id, before });
  });
}
