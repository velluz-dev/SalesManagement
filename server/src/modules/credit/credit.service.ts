import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { contains, pageArgs, paged } from '../../lib/pagination';
import { ZERO } from '../../lib/money';
import { customerScope } from '../customers/customers.service';
import { deriveInvoiceState, overdueWhere } from '../invoices/invoices.service';
import { creditSchema, listCreditQuery } from './credit.validation';

function scopedCustomers(actor: Actor): Prisma.CustomerWhereInput {
  const hasCustomerScope = ['customer.read.own', 'customer.read.team', 'customer.read.all'].some((p) => actor.permissions.has(p));
  return hasCustomerScope ? customerScope(actor) : {};
}

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

export async function listCredit(actor: Actor, q: z.infer<typeof listCreditQuery>) {
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
      select: { id: true, name: true, type: true, owner: { select: { id: true, name: true } }, credit: true, paymentTerm: { select: { id: true, name: true, days: true } } },
      orderBy: { name: q.order === 'desc' ? 'desc' : 'asc' },
      ...(all ? {} : pageArgs(q)),
    }),
    prisma.customer.count({ where }),
  ]);
  const { open, overdue } = await exposureByCustomer(rows.map((r) => r.id));
  let data = rows.map((c) => ({ ...c, ...summarize(c.credit, open.get(c.id) ?? ZERO, overdue.get(c.id) ?? ZERO) }));
  if (all) {
    data = data.filter((d) => d.overLimit === q.overLimit);
    const start = (q.page - 1) * q.pageSize;
    return paged(data.slice(start, start + q.pageSize), data.length, q);
  }
  return paged(data, total, q);
}

export async function getCredit(actor: Actor, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...scopedCustomers(actor) },
    select: {
      id: true, name: true, email: true, type: true, owner: { select: { id: true, name: true } },
      paymentTerm: { select: { id: true, name: true, days: true } },
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
  return {
    ...customer,
    ...summarize(customer.credit, open.get(customerId) ?? ZERO, overdue.get(customerId) ?? ZERO),
    openInvoices: openInvoices.map((i) => ({ ...i, ...deriveInvoiceState(i) })),
  };
}

export async function updateCredit(actor: Actor, customerId: string, input: z.infer<typeof creditSchema>) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, ...scopedCustomers(actor) } });
    if (!customer) throw notFound('Customer');
    const before = await tx.customerCredit.findUnique({ where: { customerId } });
    const { paymentTermId, ...creditInput } = input;
    if (paymentTermId !== undefined) {
      if (paymentTermId && !(await tx.paymentTerm.findFirst({ where: { id: paymentTermId, isActive: true } }))) {
        throw badRequest('Payment term not found or inactive');
      }
      await tx.customer.update({ where: { id: customerId }, data: { paymentTermId } });
    }
    const c = await tx.customerCredit.upsert({
      where: { customerId },
      create: { customerId, ...creditInput, updatedById: actor.user.id },
      update: { ...creditInput, updatedById: actor.user.id },
    });
    await audit(tx, actor, {
      action: 'credit.updated',
      entityType: 'CustomerCredit',
      entityId: customerId,
      before: { ...before, paymentTermId: customer.paymentTermId },
      after: { ...c, paymentTermId: paymentTermId !== undefined ? paymentTermId : customer.paymentTermId },
    });
    return c;
  });
}
