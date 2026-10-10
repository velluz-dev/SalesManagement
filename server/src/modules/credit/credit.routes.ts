import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { getActor, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged } from '../../lib/pagination';
import { booleanQuery, money, optionalText, uuid } from '../../lib/validation';
import { ZERO } from '../../lib/money';
import { customerScope } from '../customers/customers.service';
import { deriveInvoiceState, overdueWhere } from '../invoices/invoices.service';

export const creditRouter = Router();

const listCreditQuery = listQuery(['name'] as const).extend({
  onHold: booleanQuery,
  overLimit: booleanQuery,
});

const creditSchema = z.strictObject({
  creditLimit: money,
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  onHold: z.boolean().default(false),
  notes: optionalText(1000),
});

/** Customers visible to the actor; credit holders without a customer read scope fall back to all. */
function scopedCustomers(actor: Actor): Prisma.CustomerWhereInput {
  const hasCustomerScope = ['customer.read.own', 'customer.read.team', 'customer.read.all'].some((p) => actor.permissions.has(p));
  return hasCustomerScope ? customerScope(actor) : {};
}

/** Exposure (open balance) and overdue amounts per customer, computed from invoices. */
async function exposureByCustomer(customerIds: string[]) {
  const [open, overdue] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, ...overdueWhere() },
      _sum: { total: true, amountPaid: true },
    }),
  ]);
  const toMap = (rows: typeof open) =>
    new Map(rows.map((r) => [r.customerId, (r._sum.total ?? ZERO).sub(r._sum.amountPaid ?? ZERO)]));
  return { open: toMap(open), overdue: toMap(overdue) };
}

function summarize(credit: { creditLimit: Prisma.Decimal } | null, exposure: Prisma.Decimal, overdue: Prisma.Decimal) {
  const limit = credit?.creditLimit ?? null;
  return {
    exposure: exposure.toFixed(2),
    overdue: overdue.toFixed(2),
    available: limit ? Prisma.Decimal.max(limit.sub(exposure), ZERO).toFixed(2) : null,
    utilization: limit && limit.gt(0) ? Number(exposure.div(limit).mul(100).toFixed(1)) : null,
    overLimit: limit ? exposure.gt(limit) : false,
  };
}

creditRouter.get('/', requirePermission('credit.read'), async (req, res) => {
  const actor = getActor(req);
  const q = listCreditQuery.parse(req.query);
  const where: Prisma.CustomerWhereInput = {
    AND: [
      scopedCustomers(actor),
      q.q ? { name: contains(q.q) } : {},
      q.onHold !== undefined ? (q.onHold ? { credit: { onHold: true } } : { OR: [{ credit: null }, { credit: { onHold: false } }] }) : {},
    ],
  };
  const all = q.overLimit !== undefined;
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: { id: true, name: true, owner: { select: { id: true, name: true } }, credit: true },
      orderBy: { name: q.order === 'desc' ? 'desc' : 'asc' },
      ...(all ? {} : pageArgs(q)),
    }),
    prisma.customer.count({ where }),
  ]);
  const { open, overdue } = await exposureByCustomer(rows.map((r) => r.id));
  let data = rows.map((c) => ({ ...c, ...summarize(c.credit, open.get(c.id) ?? ZERO, overdue.get(c.id) ?? ZERO) }));
  if (all) {
    // overLimit is derived, so it is filtered after computing exposure.
    data = data.filter((d) => d.overLimit === q.overLimit);
    const start = (q.page - 1) * q.pageSize;
    return res.json(paged(data.slice(start, start + q.pageSize), data.length, q));
  }
  res.json(paged(data, total, q));
});

creditRouter.get('/:customerId', requirePermission('credit.read'), async (req, res) => {
  const actor = getActor(req);
  const customerId = uuid.parse(req.params.customerId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...scopedCustomers(actor) },
    select: {
      id: true, name: true, email: true, owner: { select: { id: true, name: true } },
      credit: { include: { updatedBy: { select: { id: true, name: true } } } },
    },
  });
  if (!customer) throw notFound('Customer');
  const openInvoices = actor.permissions.has('invoice.read')
    ? await prisma.invoice.findMany({
        where: { customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        select: { id: true, number: true, status: true, total: true, amountPaid: true, dueDate: true, issueDate: true },
        orderBy: { dueDate: 'asc' },
      })
    : [];
  const { open, overdue } = await exposureByCustomer([customerId]);
  res.json({
    data: {
      ...customer,
      ...summarize(customer.credit, open.get(customerId) ?? ZERO, overdue.get(customerId) ?? ZERO),
      openInvoices: openInvoices.map((i) => ({ ...i, ...deriveInvoiceState(i) })),
    },
  });
});

creditRouter.put('/:customerId', requirePermission('credit.manage'), async (req, res) => {
  const actor = getActor(req);
  const customerId = uuid.parse(req.params.customerId);
  const input = creditSchema.parse(req.body);
  const credit = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, ...scopedCustomers(actor) } });
    if (!customer) throw notFound('Customer');
    const before = await tx.customerCredit.findUnique({ where: { customerId } });
    const c = await tx.customerCredit.upsert({
      where: { customerId },
      create: { customerId, ...input, updatedById: actor.user.id },
      update: { ...input, updatedById: actor.user.id },
    });
    await audit(tx, actor, { action: 'credit.updated', entityType: 'CustomerCredit', entityId: customerId, before, after: c });
    return c;
  });
  res.json({ data: credit });
});
