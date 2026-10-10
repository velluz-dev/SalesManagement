import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { dateOnly } from '../../lib/validation';
import { addDays, daysBetween, startOfTodayUtc } from '../../lib/dates';
import { ZERO } from '../../lib/money';
import { fillMonths, ownerSql, reportOwners } from './report-scope';

export const reportsRouter = Router();

const rangeQuery = z
  .object({ from: dateOnly.optional(), to: dateOnly.optional() })
  .transform((v) => {
    const to = v.to ?? startOfTodayUtc();
    const from = v.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    return { from, to, toExclusive: addDays(to, 1) };
  })
  .refine((v) => v.from <= v.to, 'from must be before to');

const monthCount = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1;

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

reportsRouter.get('/sales', requireAnyPermission('report.sales.own', 'report.sales.team', 'report.sales.all'), async (req, res) => {
  const actor = getActor(req);
  const { from, to, toExclusive } = rangeQuery.parse(req.query);
  const owners = reportOwners(actor);

  const bySalesperson = await prisma.$queryRaw<
    { ownerId: string; name: string; wonAmount: Prisma.Decimal; wonCount: bigint; lostCount: bigint; openAmount: Prisma.Decimal; openCount: bigint }[]
  >`
    SELECT u.id AS "ownerId", u.name,
      COALESCE(SUM(o.amount) FILTER (WHERE o.stage = 'CLOSED_WON' AND o."closedAt" >= ${from} AND o."closedAt" < ${toExclusive}), 0) AS "wonAmount",
      COUNT(o.id) FILTER (WHERE o.stage = 'CLOSED_WON' AND o."closedAt" >= ${from} AND o."closedAt" < ${toExclusive}) AS "wonCount",
      COUNT(o.id) FILTER (WHERE o.stage = 'CLOSED_LOST' AND o."closedAt" >= ${from} AND o."closedAt" < ${toExclusive}) AS "lostCount",
      COALESCE(SUM(o.amount) FILTER (WHERE o.stage NOT IN ('CLOSED_WON','CLOSED_LOST')), 0) AS "openAmount",
      COUNT(o.id) FILTER (WHERE o.stage NOT IN ('CLOSED_WON','CLOSED_LOST')) AS "openCount"
    FROM "Opportunity" o JOIN "User" u ON u.id = o."ownerId"
    WHERE 1=1 ${ownerSql(owners, 'ownerId')}
    GROUP BY u.id, u.name
    ORDER BY "wonAmount" DESC`;

  const quotations = await prisma.$queryRaw<{ ownerId: string; total: bigint; approved: bigint; rejected: bigint; accepted: bigint }[]>`
    SELECT q."ownerId",
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE q.status IN ('APPROVED','SENT','ACCEPTED','DECLINED')) AS approved,
      COUNT(*) FILTER (WHERE q.status = 'REJECTED') AS rejected,
      COUNT(*) FILTER (WHERE q.status = 'ACCEPTED') AS accepted
    FROM "Quotation" q
    WHERE q."createdAt" >= ${from} AND q."createdAt" < ${toExclusive} AND q.status <> 'SUPERSEDED' ${ownerSql(owners, 'ownerId')}
    GROUP BY q."ownerId"`;
  const qMap = new Map(quotations.map((q) => [q.ownerId, q]));

  const monthlyRaw = await prisma.$queryRaw<{ month: string; won: Prisma.Decimal; count: bigint }[]>`
    SELECT to_char(date_trunc('month', o."closedAt"), 'YYYY-MM') AS month, SUM(o.amount) AS won, COUNT(*) AS count
    FROM "Opportunity" o
    WHERE o.stage = 'CLOSED_WON' AND o."closedAt" >= ${monthStart(from)} AND o."closedAt" < ${toExclusive} ${ownerSql(owners, 'ownerId')}
    GROUP BY 1 ORDER BY 1`;

  const pipeline = await prisma.opportunity.groupBy({
    by: ['stage'],
    where: owners ? { ownerId: { in: owners } } : {},
    _sum: { amount: true },
    _count: true,
  });

  res.json({
    data: {
      range: { from, to },
      scope: owners ? (owners.length === 1 && owners[0] === actor.user.id ? 'own' : 'team') : 'all',
      bySalesperson: bySalesperson.map((r) => {
        const q = qMap.get(r.ownerId);
        const won = Number(r.wonCount);
        const lost = Number(r.lostCount);
        return {
          ownerId: r.ownerId,
          name: r.name,
          wonAmount: new Prisma.Decimal(r.wonAmount).toFixed(2),
          wonCount: won,
          lostCount: lost,
          winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
          openAmount: new Prisma.Decimal(r.openAmount).toFixed(2),
          openCount: Number(r.openCount),
          quotations: Number(q?.total ?? 0),
          quotationsApproved: Number(q?.approved ?? 0),
          quotationsRejected: Number(q?.rejected ?? 0),
          quotationsAccepted: Number(q?.accepted ?? 0),
        };
      }),
      monthly: fillMonths(
        monthlyRaw.map((m) => ({ month: m.month, won: new Prisma.Decimal(m.won).toFixed(2), count: Number(m.count) })),
        monthStart(from),
        monthCount(from, to),
        { won: '0.00', count: 0 },
      ),
      pipeline: pipeline.map((p) => ({ stage: p.stage, count: p._count, amount: (p._sum.amount ?? ZERO).toFixed(2) })),
    },
  });
});

export async function agingBuckets() {
  const today = startOfTodayUtc();
  const open = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    select: { total: true, amountPaid: true, dueDate: true },
  });
  const buckets = { current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, d90_plus: ZERO };
  for (const i of open) {
    const bal = i.total.sub(i.amountPaid);
    const days = i.dueDate ? daysBetween(i.dueDate, today) : 0;
    const key = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
    buckets[key] = buckets[key].add(bal);
  }
  return [
    { bucket: 'Current', amount: buckets.current.toFixed(2) },
    { bucket: '1 to 30 days', amount: buckets.d1_30.toFixed(2) },
    { bucket: '31 to 60 days', amount: buckets.d31_60.toFixed(2) },
    { bucket: '61 to 90 days', amount: buckets.d61_90.toFixed(2) },
    { bucket: '90+ days', amount: buckets.d90_plus.toFixed(2) },
  ];
}

reportsRouter.get('/finance', requirePermission('report.finance'), async (req, res) => {
  const { from, to, toExclusive } = rangeQuery.parse(req.query);
  const mFrom = monthStart(from);

  const [invoiced, collected, methods, topDebtors, aging, totals] = await Promise.all([
    prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') AS month, SUM(total) AS amount
      FROM "Invoice" WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID') AND "issueDate" >= ${mFrom} AND "issueDate" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS month, SUM(amount) AS amount
      FROM "Payment" WHERE "voidedAt" IS NULL AND "paidAt" >= ${mFrom} AND "paidAt" < ${toExclusive}
      GROUP BY 1 ORDER BY 1`,
    prisma.payment.groupBy({
      by: ['method'],
      where: { voidedAt: null, paidAt: { gte: from, lt: toExclusive } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.$queryRaw<{ customerId: string; name: string; outstanding: Prisma.Decimal; overdue: Prisma.Decimal }[]>`
      SELECT c.id AS "customerId", c.name,
        SUM(i.total - i."amountPaid") AS outstanding,
        COALESCE(SUM(i.total - i."amountPaid") FILTER (WHERE i."dueDate" < CURRENT_DATE), 0) AS overdue
      FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
      WHERE i.status IN ('ISSUED','PARTIALLY_PAID')
      GROUP BY c.id, c.name ORDER BY outstanding DESC LIMIT 10`,
    agingBuckets(),
    prisma.$queryRaw<{ invoiced: Prisma.Decimal | null; collected: Prisma.Decimal | null }[]>`
      SELECT
        (SELECT SUM(total) FROM "Invoice" WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID') AND "issueDate" >= ${from} AND "issueDate" < ${toExclusive}) AS invoiced,
        (SELECT SUM(amount) FROM "Payment" WHERE "voidedAt" IS NULL AND "paidAt" >= ${from} AND "paidAt" < ${toExclusive}) AS collected`,
  ]);

  const n = monthCount(from, to);
  const invMap = new Map(invoiced.map((r) => [r.month, new Prisma.Decimal(r.amount).toFixed(2)]));
  const colMap = new Map(collected.map((r) => [r.month, new Prisma.Decimal(r.amount).toFixed(2)]));
  const monthly = fillMonths<{ month: string; invoiced: string; collected: string }>([], mFrom, n, { invoiced: '0.00', collected: '0.00' }).map((m) => ({
    month: m.month,
    invoiced: invMap.get(m.month) ?? '0.00',
    collected: colMap.get(m.month) ?? '0.00',
  }));

  const outstanding = aging.reduce((s, b) => s.add(b.amount), ZERO);
  const overdue = aging.slice(1).reduce((s, b) => s.add(b.amount), ZERO);

  res.json({
    data: {
      range: { from, to },
      totals: {
        invoiced: new Prisma.Decimal(totals[0]?.invoiced ?? 0).toFixed(2),
        collected: new Prisma.Decimal(totals[0]?.collected ?? 0).toFixed(2),
        outstanding: outstanding.toFixed(2),
        overdue: overdue.toFixed(2),
      },
      monthly,
      aging,
      paymentMethods: methods.map((m) => ({ method: m.method, count: m._count, amount: (m._sum.amount ?? ZERO).toFixed(2) })),
      topDebtors: topDebtors.map((d) => ({
        customerId: d.customerId,
        name: d.name,
        outstanding: new Prisma.Decimal(d.outstanding).toFixed(2),
        overdue: new Prisma.Decimal(d.overdue).toFixed(2),
      })),
    },
  });
});
