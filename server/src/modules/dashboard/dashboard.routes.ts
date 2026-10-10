import { Router } from 'express';
import { resolveScope } from '@crm/shared';
import { prisma, Prisma } from '../../lib/prisma';
import { getActor, type Actor } from '../../lib/auth-context';
import { startOfTodayUtc } from '../../lib/dates';
import { ZERO } from '../../lib/money';
import { getSetting } from '../../lib/settings';
import { fillMonths, monthsBack, ownerIn, ownerSql } from '../reports/report-scope';
import { agingBuckets } from '../reports/reports.routes';
import { overdueWhere } from '../invoices/invoices.service';
import { targetScopeWhere, withProgress } from '../targets/targets.service';

export const dashboardRouter = Router();

/** Owners for the sales widgets: the actor's widest opportunity/lead read scope. */
function salesOwners(actor: Actor): string[] | null | undefined {
  const scope = resolveScope(actor.permissions, 'opportunity') ?? resolveScope(actor.permissions, 'report.sales');
  if (!scope) return undefined;
  if (scope === 'all') return null;
  return scope === 'team' ? actor.teamMemberIds : [actor.user.id];
}

async function salesSection(actor: Actor, owners: string[] | null) {
  const today = startOfTodayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = monthsBack(6);
  const [activeLeads, openOpps, wonThisMonth, quotationStatus, monthly, pipeline] = await Promise.all([
    prisma.lead.count({ where: { ...ownerIn(owners), status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } } }),
    prisma.opportunity.aggregate({
      where: { ...ownerIn(owners), stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.opportunity.aggregate({
      where: { ...ownerIn(owners), stage: 'CLOSED_WON', closedAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.quotation.groupBy({
      by: ['status'],
      where: { ...ownerIn(owners), status: { not: 'SUPERSEDED' } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.$queryRaw<{ month: string; won: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "closedAt"), 'YYYY-MM') AS month, SUM(amount) AS won
      FROM "Opportunity" WHERE stage = 'CLOSED_WON' AND "closedAt" >= ${from} ${ownerSql(owners, 'ownerId')}
      GROUP BY 1 ORDER BY 1`,
    prisma.opportunity.groupBy({
      by: ['stage'],
      where: { ...ownerIn(owners), stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  let targets: Awaited<ReturnType<typeof withProgress>>[] = [];
  if (resolveScope(actor.permissions, 'target')) {
    const rows = await prisma.salesTarget.findMany({
      where: { AND: [targetScopeWhere(actor), { periodStart: { lte: today }, periodEnd: { gte: today } }] },
      include: {
        user: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, members: { select: { id: true } } } },
        setBy: { select: { id: true, name: true } },
      },
      orderBy: { periodStart: 'desc' },
      take: 10,
    });
    targets = await Promise.all(rows.map((r) => withProgress(prisma, r)));
  }

  return {
    activeLeads,
    openOpportunities: { count: openOpps._count, amount: (openOpps._sum.amount ?? ZERO).toFixed(2) },
    wonThisMonth: { count: wonThisMonth._count, amount: (wonThisMonth._sum.amount ?? ZERO).toFixed(2) },
    quotationsByStatus: quotationStatus.map((q) => ({ status: q.status, count: q._count, amount: (q._sum.total ?? ZERO).toFixed(2) })),
    monthlyWon: fillMonths(monthly.map((m) => ({ month: m.month, won: new Prisma.Decimal(m.won).toFixed(2) })), from, 6, { won: '0.00' }),
    pipeline: pipeline.map((p) => ({ stage: p.stage, count: p._count, amount: (p._sum.amount ?? ZERO).toFixed(2) })),
    targets,
    achievementBasis: await getSetting(prisma, 'targets.achievementBasis'),
  };
}

async function approvalsSection(actor: Actor) {
  const allowSelf = await getSetting(prisma, 'approval.allowSelfApproval');
  const where: Prisma.ApprovalRequestWhereInput = {
    status: 'PENDING',
    OR: [{ assignedToId: actor.user.id }, { assignedToId: null, approverRole: { code: { in: actor.roles } } }],
    ...(allowSelf ? {} : { requestedById: { not: actor.user.id }, quotation: { ownerId: { not: actor.user.id } } }),
  };
  const [count, sum, oldest] = await Promise.all([
    prisma.approvalRequest.count({ where }),
    prisma.approvalRequest.aggregate({ where, _sum: { amount: true } }),
    prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 5,
      include: {
        quotation: { select: { id: true, number: true, version: true, currency: true, customer: { select: { name: true } } } },
        requestedBy: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { pendingCount: count, pendingAmount: (sum._sum.amount ?? ZERO).toFixed(2), oldest };
}

async function financeSection() {
  const today = startOfTodayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = monthsBack(6);
  const [open, overdue, paidThisMonth, credits, monthly, aging, overdueList] = await Promise.all([
    prisma.invoice.aggregate({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.invoice.aggregate({ where: overdueWhere(), _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.payment.aggregate({ where: { voidedAt: null, paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    prisma.customerCredit.findMany({ select: { customerId: true, creditLimit: true, onHold: true } }),
    prisma.$queryRaw<{ month: string; invoiced: Prisma.Decimal | null; collected: Prisma.Decimal | null }[]>`
      SELECT m.month,
        (SELECT SUM(total) FROM "Invoice" WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID') AND to_char("issueDate", 'YYYY-MM') = m.month) AS invoiced,
        (SELECT SUM(amount) FROM "Payment" WHERE "voidedAt" IS NULL AND to_char("paidAt", 'YYYY-MM') = m.month) AS collected
      FROM (SELECT to_char(generate_series(${from}::date, CURRENT_DATE, interval '1 month'), 'YYYY-MM') AS month) m
      ORDER BY 1`,
    agingBuckets(),
    prisma.invoice.findMany({
      where: overdueWhere(),
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, customer: { select: { id: true, name: true } } },
    }),
  ]);

  const exposureRows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    _sum: { total: true, amountPaid: true },
  });
  const exposure = new Map(exposureRows.map((r) => [r.customerId, (r._sum.total ?? ZERO).sub(r._sum.amountPaid ?? ZERO)]));
  const totalLimit = credits.reduce((s, c) => s.add(c.creditLimit), ZERO);
  const overLimit = credits.filter((c) => (exposure.get(c.customerId) ?? ZERO).gt(c.creditLimit)).length;

  const bal = (a: { _sum: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null } }) =>
    (a._sum.total ?? ZERO).sub(a._sum.amountPaid ?? ZERO).toFixed(2);

  return {
    receivables: { count: open._count, amount: bal(open) },
    overdue: { count: overdue._count, amount: bal(overdue) },
    paymentsThisMonth: { count: paidThisMonth._count, amount: (paidThisMonth._sum.amount ?? ZERO).toFixed(2) },
    credit: {
      totalLimit: totalLimit.toFixed(2),
      totalExposure: [...exposure.values()].reduce((s, v) => s.add(v), ZERO).toFixed(2),
      customersOverLimit: overLimit,
      customersOnHold: credits.filter((c) => c.onHold).length,
    },
    monthly: monthly.map((m) => ({
      month: m.month,
      invoiced: new Prisma.Decimal(m.invoiced ?? 0).toFixed(2),
      collected: new Prisma.Decimal(m.collected ?? 0).toFixed(2),
    })),
    aging,
    overdueInvoices: overdueList.map((i) => ({ ...i, balance: i.total.sub(i.amountPaid).toFixed(2) })),
  };
}

async function adminSection(actor: Actor) {
  const [total, active, roles, sessions, recent, logins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.role.findMany({ select: { id: true, name: true, code: true, _count: { select: { users: true } } }, orderBy: { name: 'asc' } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    actor.permissions.has('audit.read')
      ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { id: true, name: true } } } })
      : Promise.resolve([]),
    actor.permissions.has('audit.read')
      ? prisma.$queryRaw<{ day: string; success: bigint; failed: bigint }[]>`
          SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT COUNT(*) FROM "AuditLog" WHERE action = 'auth.login' AND "createdAt"::date = d) AS success,
            (SELECT COUNT(*) FROM "AuditLog" WHERE action = 'auth.login_failed' AND "createdAt"::date = d) AS failed
          FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') d ORDER BY 1`
      : Promise.resolve([]),
  ]);
  return {
    users: { total, active, inactive: total - active },
    roles: roles.map((r) => ({ id: r.id, name: r.name, code: r.code, users: r._count.users })),
    activeSessions: sessions,
    recentActivity: recent,
    logins: logins.map((l) => ({ day: l.day, success: Number(l.success), failed: Number(l.failed) })),
  };
}

dashboardRouter.get('/', async (req, res) => {
  const actor = getActor(req);
  const p = actor.permissions;
  const owners = salesOwners(actor);
  const [sales, approvals, finance, admin] = await Promise.all([
    owners !== undefined ? salesSection(actor, owners) : null,
    p.has('approval.read.assigned') && p.has('approval.decide') ? approvalsSection(actor) : null,
    p.has('report.finance') || p.has('invoice.read') ? financeSection() : null,
    p.has('user.read') ? adminSection(actor) : null,
  ]);
  res.json({ data: { sales, approvals, finance, admin } });
});
