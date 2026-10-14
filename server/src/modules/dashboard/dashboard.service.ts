import { resolveScope } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { endOfDay, startOfTodayUtc } from '../../lib/dates';
import { usersWithPermission } from '../../lib/notify';
import { followUpWhere } from '../leads/leads.service';
import { ZERO } from '../../lib/money';
import { getSetting } from '../../lib/settings';
import { fillMonths, monthsBack, ownerIn, ownerSql } from '../reports/report-scope';
import { agingBuckets } from '../reports/reports.service';
import { overdueWhere } from '../invoices/invoices.service';
import { targetScopeWhere, withProgress } from '../targets/targets.service';

function salesOwners(actor: Actor): string[] | null | undefined {
  const scope = resolveScope(actor.permissions, 'opportunity') ?? resolveScope(actor.permissions, 'report.sales');
  if (!scope) return undefined;
  if (scope === 'all') return null;
  return scope === 'team' ? actor.teamMemberIds : [actor.user.id];
}

async function followUpsSection(owners: string[] | null) {
  const now = new Date();
  const cutoff = endOfDay(startOfTodayUtc(now));
  const activityWhere: Prisma.ActivityWhereInput = { ...ownerIn(owners), completedAt: null, dueAt: { lte: cutoff } };
  const leadWhere: Prisma.LeadWhereInput = { ...ownerIn(owners), ...followUpWhere('due', now) };
  const [activities, leads, overdueActivities, overdueLeads] = await Promise.all([
    prisma.activity.findMany({
      where: activityWhere,
      orderBy: { dueAt: 'asc' },
      take: 8,
      select: {
        id: true, type: true, subject: true, dueAt: true,
        owner: { select: { id: true, name: true } },
        lead: { select: { id: true, title: true } },
        opportunity: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { nextFollowUpAt: 'asc' },
      take: 8,
      select: { id: true, title: true, contactName: true, nextFollowUpAt: true, owner: { select: { id: true, name: true } } },
    }),
    prisma.activity.count({ where: { ...activityWhere, dueAt: { lt: now } } }),
    prisma.lead.count({ where: { ...ownerIn(owners), ...followUpWhere('overdue', now) } }),
  ]);
  const [activityTotal, leadTotal] = await Promise.all([prisma.activity.count({ where: activityWhere }), prisma.lead.count({ where: leadWhere })]);
  const items = [
    ...activities.map((a) => ({
      kind: 'activity' as const,
      id: a.id,
      type: a.type,
      title: a.subject,
      related: a.lead?.title ?? a.opportunity?.name ?? a.customer?.name ?? null,
      link: a.lead ? `/leads/${a.lead.id}` : a.opportunity ? `/opportunities/${a.opportunity.id}` : a.customer ? `/customers/${a.customer.id}` : '/activities',
      dueAt: a.dueAt!,
      owner: a.owner,
    })),
    ...leads.map((l) => ({
      kind: 'lead' as const,
      id: l.id,
      type: null,
      title: l.contactName,
      related: l.title,
      link: `/leads/${l.id}`,
      dueAt: l.nextFollowUpAt!,
      owner: l.owner,
    })),
  ]
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, 8)
    .map((i) => ({ ...i, overdue: i.dueAt < now }));
  return { total: activityTotal + leadTotal, overdue: overdueActivities + overdueLeads, items };
}

async function teamPerformance(owners: string[] | null) {
  if (owners && owners.length <= 1) return null;
  const today = startOfTodayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const sellers = await usersWithPermission(prisma, 'quotation.create');
  const ids = owners ? sellers.filter((id) => owners.includes(id)) : sellers;
  if (!ids.length) return null;
  const basis = await getSetting(prisma, 'targets.achievementBasis');
  const now = new Date();
  const [users, won, invoiced, pipeline, overdue, userTargets, teamTargets] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true, team: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } }),
    prisma.opportunity.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: 'CLOSED_WON', closedAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.groupBy({
      by: ['salespersonId'],
      where: { salespersonId: { in: ids }, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] }, issueDate: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.opportunity.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } }, _sum: { amount: true }, _count: true }),
    prisma.activity.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, completedAt: null, dueAt: { lt: now } }, _count: true }),
    prisma.salesTarget.findMany({ where: { userId: { in: ids }, periodType: 'MONTH', periodStart: { lte: today }, periodEnd: { gte: today } }, select: { userId: true, amount: true } }),
    owners ? Promise.resolve([]) : prisma.salesTarget.findMany({ where: { teamId: { not: null }, periodType: 'MONTH', periodStart: { lte: today }, periodEnd: { gte: today } }, select: { teamId: true, amount: true } }),
  ]);
  const achieved = new Map<string, Prisma.Decimal>(
    basis === 'INVOICED'
      ? invoiced.map((r) => [r.salespersonId!, r._sum.total ?? ZERO])
      : won.map((r) => [r.ownerId, r._sum.amount ?? ZERO]),
  );
  const pipe = new Map(pipeline.map((p) => [p.ownerId, { amount: p._sum.amount ?? ZERO, count: p._count }]));
  const late = new Map(overdue.map((o) => [o.ownerId, o._count]));
  const target = new Map<string, Prisma.Decimal>();
  for (const t of userTargets) target.set(t.userId!, (target.get(t.userId!) ?? ZERO).add(t.amount));
  const percent = (a: Prisma.Decimal, t: Prisma.Decimal | null) => (t && t.gt(0) ? Math.round(Number(a.div(t).mul(100))) : null);

  const members = users.map((u) => {
    const a = achieved.get(u.id) ?? ZERO;
    const t = target.get(u.id) ?? null;
    return {
      id: u.id,
      name: u.name,
      team: u.team,
      achieved: a.toFixed(2),
      target: t?.toFixed(2) ?? null,
      percent: percent(a, t),
      pipeline: (pipe.get(u.id)?.amount ?? ZERO).toFixed(2),
      openDeals: pipe.get(u.id)?.count ?? 0,
      overdueFollowUps: late.get(u.id) ?? 0,
    };
  });

  let teams = null;
  if (!owners) {
    const byTeam = new Map<string, { id: string; name: string; achieved: Prisma.Decimal; memberTarget: Prisma.Decimal; pipeline: Prisma.Decimal; overdueFollowUps: number; members: number }>();
    for (const m of members) {
      if (!m.team) continue;
      const row = byTeam.get(m.team.id) ?? { id: m.team.id, name: m.team.name, achieved: ZERO, memberTarget: ZERO, pipeline: ZERO, overdueFollowUps: 0, members: 0 };
      row.achieved = row.achieved.add(m.achieved);
      row.memberTarget = row.memberTarget.add(m.target ?? 0);
      row.pipeline = row.pipeline.add(m.pipeline);
      row.overdueFollowUps += m.overdueFollowUps;
      row.members += 1;
      byTeam.set(m.team.id, row);
    }
    const teamTarget = new Map<string, Prisma.Decimal>();
    for (const t of teamTargets) teamTarget.set(t.teamId!, (teamTarget.get(t.teamId!) ?? ZERO).add(t.amount));
    teams = [...byTeam.values()]
      .map((r) => {
        const t = teamTarget.get(r.id) ?? (r.memberTarget.gt(0) ? r.memberTarget : null);
        return {
          id: r.id,
          name: r.name,
          members: r.members,
          achieved: r.achieved.toFixed(2),
          target: t?.toFixed(2) ?? null,
          percent: percent(r.achieved, t),
          pipeline: r.pipeline.toFixed(2),
          overdueFollowUps: r.overdueFollowUps,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return { basis, members, teams };
}

async function salesSection(actor: Actor, owners: string[] | null) {
  const today = startOfTodayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const from = monthsBack(6);
  const [activeLeads, openOpps, wonThisMonth, quotationStatus, monthly, pipeline, wonLastMonth, daily, leadFunnel, oppFunnel, recentQuotations] = await Promise.all([
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
    prisma.opportunity.aggregate({
      where: { ...ownerIn(owners), stage: 'CLOSED_WON', closedAt: { gte: lastMonthStart, lt: monthStart } },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ day: number; won: Prisma.Decimal }[]>`
      SELECT EXTRACT(DAY FROM "closedAt")::int AS day, SUM(amount) AS won
      FROM "Opportunity" WHERE stage = 'CLOSED_WON' AND "closedAt" >= ${monthStart} ${ownerSql(owners, 'ownerId')}
      GROUP BY 1 ORDER BY 1`,
    prisma.lead.groupBy({ by: ['status'], where: ownerIn(owners), _count: true }),
    prisma.opportunity.groupBy({ by: ['stage'], where: ownerIn(owners), _count: true }),
    prisma.quotation.findMany({
      where: { ...ownerIn(owners), status: { not: 'SUPERSEDED' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, number: true, version: true, status: true, total: true, currency: true, validUntil: true, customer: { select: { id: true, name: true } } },
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

  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const monthTarget = targets
    .filter((t) => t.userId && t.periodType === 'MONTH')
    .reduce((sum, t) => sum.add(t.amount), ZERO);
  const wonByDay = new Map(daily.map((d) => [d.day, new Prisma.Decimal(d.won)]));
  let running = ZERO;
  const dailyPerformance = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    running = running.add(wonByDay.get(day) ?? ZERO);
    return {
      day,
      won: day <= today.getUTCDate() ? running.toFixed(2) : null,
      target: monthTarget.gt(0) ? monthTarget.mul(day).div(daysInMonth).toFixed(2) : null,
    };
  });

  const leadCount = (statuses: string[]) => leadFunnel.filter((l) => statuses.includes(l.status)).reduce((n, l) => n + l._count, 0);
  const oppCount = (stages: string[]) => oppFunnel.filter((o) => stages.includes(o.stage)).reduce((n, o) => n + o._count, 0);
  const funnel = [
    { stage: 'Leads', count: leadCount(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']) },
    { stage: 'Qualified', count: leadCount(['QUALIFIED', 'CONVERTED']) },
    { stage: 'Proposal', count: oppCount(['PROPOSAL', 'NEGOTIATION', 'CLOSED_WON']) },
    { stage: 'Negotiation', count: oppCount(['NEGOTIATION', 'CLOSED_WON']) },
    { stage: 'Won', count: oppCount(['CLOSED_WON']) },
  ];

  const myTarget = targets.find((t) => t.userId === actor.user.id) ?? null;

  return {
    activeLeads,
    openOpportunities: { count: openOpps._count, amount: (openOpps._sum.amount ?? ZERO).toFixed(2) },
    wonThisMonth: { count: wonThisMonth._count, amount: (wonThisMonth._sum.amount ?? ZERO).toFixed(2) },
    wonLastMonth: (wonLastMonth._sum.amount ?? ZERO).toFixed(2),
    dailyPerformance,
    monthTarget: monthTarget.toFixed(2),
    funnel,
    recentQuotations,
    myTarget,
    quotationsByStatus: quotationStatus.map((q) => ({ status: q.status, count: q._count, amount: (q._sum.total ?? ZERO).toFixed(2) })),
    monthlyWon: fillMonths(monthly.map((m) => ({ month: m.month, won: new Prisma.Decimal(m.won).toFixed(2) })), from, 6, { won: '0.00' }),
    pipeline: pipeline.map((p) => ({ stage: p.stage, count: p._count, amount: (p._sum.amount ?? ZERO).toFixed(2) })),
    targets,
    achievementBasis: await getSetting(prisma, 'targets.achievementBasis'),
    followUps: await followUpsSection(owners),
    team: await teamPerformance(owners),
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
        approverRole: { select: { code: true, name: true } },
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
      FROM (SELECT to_char(generate_series(${from}::date, ${startOfTodayUtc()}::date, interval '1 month'), 'YYYY-MM') AS month) m
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
          FROM generate_series(${startOfTodayUtc()}::date - 6, ${startOfTodayUtc()}::date, interval '1 day') d ORDER BY 1`
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

export async function getDashboard(actor: Actor) {
  const p = actor.permissions;
  const owners = salesOwners(actor);
  const [sales, approvals, finance, admin] = await Promise.all([
    owners !== undefined ? salesSection(actor, owners) : null,
    p.has('approval.read.assigned') && p.has('approval.decide') ? approvalsSection(actor) : null,
    p.has('report.finance') || p.has('invoice.read') ? financeSection() : null,
    p.has('user.read') ? adminSection(actor) : null,
  ]);
  return { sales, approvals, finance, admin };
}
