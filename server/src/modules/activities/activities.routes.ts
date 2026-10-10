import { Router } from 'express';
import { z } from 'zod';
import { ACTIVITY_TYPES } from '@crm/shared';
import { prisma, Prisma } from '../../lib/prisma';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor, ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged, sortBy } from '../../lib/pagination';
import { idParams, optionalText, requiredText, uuid } from '../../lib/validation';
import { ownerSelect, resolveOwnerId } from '../../lib/ownership';
import { customerScope } from '../customers/customers.service';
import { opportunityScope } from '../opportunities/opportunities.service';

export const activitiesRouter = Router();
const canRead = requireAnyPermission('activity.read.own', 'activity.read.team', 'activity.read.all');
const scope = (a: Actor): Prisma.ActivityWhereInput => ownerWhere(a, 'activity');

const listActivitiesQuery = listQuery(['dueAt', 'createdAt'] as const).extend({
  type: z.enum(ACTIVITY_TYPES).optional(),
  state: z.enum(['open', 'completed', 'overdue']).optional(),
  ownerId: uuid.optional(),
  customerId: uuid.optional(),
  leadId: uuid.optional(),
  opportunityId: uuid.optional(),
});

const activitySchema = z.strictObject({
  type: z.enum(ACTIVITY_TYPES),
  subject: requiredText(200, 'Subject'),
  description: optionalText(4000),
  dueAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).optional().nullable(),
  customerId: uuid.optional().nullable(),
  leadId: uuid.optional().nullable(),
  opportunityId: uuid.optional().nullable(),
  ownerId: uuid.optional(),
  completed: z.boolean().optional(),
});

/** Linked records must themselves be visible to the actor. */
async function assertLinks(tx: Prisma.TransactionClient, actor: Actor, input: Partial<z.infer<typeof activitySchema>>) {
  if (input.customerId && !(await tx.customer.findFirst({ where: { id: input.customerId, ...customerScope(actor) } })))
    throw badRequest('Customer not found or not accessible');
  if (input.leadId && !(await tx.lead.findFirst({ where: { id: input.leadId, ...ownerWhere(actor, 'lead') } })))
    throw badRequest('Lead not found or not accessible');
  if (input.opportunityId && !(await tx.opportunity.findFirst({ where: { id: input.opportunityId, ...opportunityScope(actor) } })))
    throw badRequest('Opportunity not found or not accessible');
}

const include = {
  owner: ownerSelect,
  customer: { select: { id: true, name: true } },
  lead: { select: { id: true, title: true } },
  opportunity: { select: { id: true, name: true } },
} as const;

activitiesRouter.get('/', canRead, async (req, res) => {
  const actor = getActor(req);
  const q = listActivitiesQuery.parse(req.query);
  const now = new Date();
  const where: Prisma.ActivityWhereInput = {
    AND: [
      scope(actor),
      q.q ? { OR: [{ subject: contains(q.q) }, { description: contains(q.q) }] } : {},
      q.type ? { type: q.type } : {},
      q.state === 'open' ? { completedAt: null } : {},
      q.state === 'completed' ? { completedAt: { not: null } } : {},
      q.state === 'overdue' ? { completedAt: null, dueAt: { lt: now } } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
      q.customerId ? { customerId: q.customerId } : {},
      q.leadId ? { leadId: q.leadId } : {},
      q.opportunityId ? { opportunityId: q.opportunityId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({ where, include, orderBy: sortBy(q.sort, q.order, ['dueAt']), ...pageArgs(q) }),
    prisma.activity.count({ where }),
  ]);
  res.json(paged(rows, total, q));
});

activitiesRouter.post('/', requirePermission('activity.manage'), async (req, res) => {
  const actor = getActor(req);
  const { completed, ownerId, ...input } = activitySchema.parse(req.body);
  const activity = await prisma.$transaction(async (tx) => {
    await assertLinks(tx, actor, input);
    const owner = await resolveOwnerId(tx, actor, ownerId);
    const a = await tx.activity.create({
      data: { ...input, ownerId: owner, completedAt: completed ? new Date() : null },
      include,
    });
    await audit(tx, actor, { action: 'activity.created', entityType: 'Activity', entityId: a.id, after: a });
    return a;
  });
  res.status(201).json({ data: activity });
});

activitiesRouter.patch('/:id', requirePermission('activity.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const { completed, ownerId, ...input } = activitySchema.partial().parse(req.body);
  const activity = await prisma.$transaction(async (tx) => {
    const before = await tx.activity.findFirst({ where: { id, ...scope(actor) } });
    if (!before) throw notFound('Activity');
    await assertLinks(tx, actor, input);
    const newOwner = ownerId && ownerId !== before.ownerId ? await resolveOwnerId(tx, actor, ownerId) : undefined;
    const a = await tx.activity.update({
      where: { id },
      data: {
        ...input,
        ...(newOwner ? { ownerId: newOwner } : {}),
        ...(completed !== undefined ? { completedAt: completed ? (before.completedAt ?? new Date()) : null } : {}),
      },
      include,
    });
    await audit(tx, actor, { action: 'activity.updated', entityType: 'Activity', entityId: id, before, after: a });
    return a;
  });
  res.json({ data: activity });
});

activitiesRouter.delete('/:id', requirePermission('activity.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await prisma.$transaction(async (tx) => {
    const before = await tx.activity.findFirst({ where: { id, ...scope(actor) } });
    if (!before) throw notFound('Activity');
    await tx.activity.delete({ where: { id } });
    await audit(tx, actor, { action: 'activity.deleted', entityType: 'Activity', entityId: id, before });
  });
  res.status(204).end();
});
