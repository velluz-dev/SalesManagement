import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged } from '../../lib/pagination';
import { booleanQuery, optionalEmail, optionalText, requiredText, uuid } from '../../lib/validation';
import { ownerSelect, resolveOwnerId } from '../../lib/ownership';

export const listCustomersQuery = listQuery(['name', 'createdAt', 'updatedAt'] as const).extend({
  ownerId: uuid.optional(),
  isActive: booleanQuery,
  industry: z.string().max(80).optional(),
});

const customerFields = {
  name: requiredText(160, 'Customer name'),
  email: optionalEmail,
  phone: optionalText(40),
  industry: optionalText(80),
  address: optionalText(400),
  taxId: optionalText(60),
};

export const createCustomerSchema = z.strictObject({ ...customerFields, ownerId: uuid.optional() });
export const updateCustomerSchema = createCustomerSchema.partial().extend({ isActive: z.boolean().optional() });

/** Scoped `where` for customers visible to the actor. */
export const customerScope = (actor: Actor): Prisma.CustomerWhereInput => ownerWhere(actor, 'customer');

export async function listCustomers(actor: Actor, q: z.infer<typeof listCustomersQuery>) {
  const where: Prisma.CustomerWhereInput = {
    AND: [
      customerScope(actor),
      q.q ? { OR: [{ name: contains(q.q) }, { email: contains(q.q) }, { industry: contains(q.q) }] } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
      q.isActive !== undefined ? { isActive: q.isActive } : {},
      q.industry ? { industry: q.industry } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { owner: ownerSelect, _count: { select: { opportunities: true, quotations: true, invoices: true } } },
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
      credit: actor.permissions.has('credit.read'),
      _count: { select: { opportunities: true, quotations: true, invoices: true, leads: true } },
    },
  });
  if (!c) throw notFound('Customer');
  return c;
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
