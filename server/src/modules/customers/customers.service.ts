import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, pageArgs, paged } from '../../lib/pagination';
import { ownerSelect, resolveOwnerId } from '../../lib/ownership';
import { startOfTodayUtc } from '../../lib/dates';
import { ZERO } from '../../lib/money';
import { createCustomerSchema, listCustomersQuery, updateCustomerSchema } from './customers.validation';

export const customerScope = (actor: Actor): Prisma.CustomerWhereInput => ownerWhere(actor, 'customer');

export async function listCustomers(actor: Actor, q: z.infer<typeof listCustomersQuery>) {
  const where: Prisma.CustomerWhereInput = {
    AND: [
      customerScope(actor),
      q.q ? { OR: [{ name: contains(q.q) }, { email: contains(q.q) }, { industry: contains(q.q) }] } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
      q.isActive !== undefined ? { isActive: q.isActive } : {},
      q.industry ? { industry: q.industry } : {},
      q.type ? { type: q.type } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { owner: ownerSelect, paymentTerm: { select: { id: true, name: true, days: true } }, _count: { select: { opportunities: true, quotations: true, invoices: true } } },
      orderBy: { [q.sort]: q.order },
      ...pageArgs(q),
    }),
    prisma.customer.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function getCustomer(actor: Actor, id: string) {
  const c = await prisma.customer.findFirst({
    where: { id, ...customerScope(actor) },
    include: {
      owner: ownerSelect,
      paymentTerm: { select: { id: true, name: true, days: true } },
      credit: actor.permissions.has('credit.read'),
      _count: { select: { opportunities: true, quotations: true, invoices: true, leads: true } },
    },
  });
  if (!c) throw notFound('Customer');
  const today = startOfTodayUtc();
  const [open, overdue, credit] = await Promise.all([
    prisma.invoice.aggregate({ where: { customerId: id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.invoice.aggregate({ where: { customerId: id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.customerCredit.findUnique({ where: { customerId: id }, select: { creditLimit: true, onHold: true } }),
  ]);
  const balance = (r: typeof open) => (r._sum.total ?? ZERO).sub(r._sum.amountPaid ?? ZERO);
  const outstanding = balance(open);
  return {
    ...c,
    account: {
      outstanding: outstanding.toFixed(2),
      openInvoices: open._count,
      overdue: balance(overdue).toFixed(2),
      overdueInvoices: overdue._count,
      creditLimit: credit?.creditLimit.toFixed(2) ?? null,
      available: credit ? Prisma.Decimal.max(credit.creditLimit.sub(outstanding), ZERO).toFixed(2) : null,
      onHold: credit?.onHold ?? false,
    },
  };
}

export async function createCustomer(actor: Actor, input: z.infer<typeof createCustomerSchema>) {
  return prisma.$transaction(async (tx) => {
    const ownerId = await resolveOwnerId(tx, actor, input.ownerId);
    const { ownerId: _o, ...data } = input;
    const c = await tx.customer.create({ data: { ...data, ownerId }, include: { owner: ownerSelect } });
    await audit(tx, actor, { action: 'customer.created', entityType: 'Customer', entityId: c.id, after: c });
    return c;
  });
}

export async function updateCustomer(
  actor: Actor,
  id: string,
  input: z.infer<typeof updateCustomerSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.customer.findFirst({ where: { id, ...customerScope(actor) } });
    if (!before) throw notFound('Customer');
    const { ownerId, ...data } = input;
    const newOwner = ownerId && ownerId !== before.ownerId ? await resolveOwnerId(tx, actor, ownerId) : undefined;
    const c = await tx.customer.update({
      where: { id },
      data: { ...data, ...(newOwner ? { ownerId: newOwner } : {}) },
      include: { owner: ownerSelect },
    });
    await audit(tx, actor, { action: 'customer.updated', entityType: 'Customer', entityId: id, before, after: c });
    return c;
  });
}
