import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';
import { listPaymentTermsQuery, termSchema, updateTermSchema } from './payment-terms.validation';

export async function listPaymentTerms(actor: Actor, q: z.infer<typeof listPaymentTermsQuery>) {
  const includeInactive = q.all && actor.permissions.has('credit.manage');
  const terms = await prisma.paymentTerm.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { _count: { select: { customers: true } } },
    orderBy: [{ days: 'asc' }, { name: 'asc' }],
  });
  return terms.map(({ _count, ...t }) => ({ ...t, customerCount: _count.customers }));
}

export async function createPaymentTerm(actor: Actor, input: z.infer<typeof termSchema>) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.paymentTerm.create({ data: input });
    await audit(tx, actor, { action: 'payment_term.created', entityType: 'PaymentTerm', entityId: t.id, after: t });
    return t;
  });
}

export async function updatePaymentTerm(actor: Actor, id: string, input: z.infer<typeof updateTermSchema>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.paymentTerm.findUnique({ where: { id } });
    if (!before) throw notFound('Payment term');
    const t = await tx.paymentTerm.update({ where: { id }, data: input });
    await audit(tx, actor, { action: 'payment_term.updated', entityType: 'PaymentTerm', entityId: id, before, after: t });
    return t;
  });
}

export async function deletePaymentTerm(actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.paymentTerm.findUnique({ where: { id }, include: { _count: { select: { customers: true, invoices: true } } } });
    if (!before) throw notFound('Payment term');
    if (before._count.customers || before._count.invoices) {
      throw conflict('This term is in use by customers or invoices. Deactivate it instead.');
    }
    await tx.paymentTerm.delete({ where: { id } });
    await audit(tx, actor, { action: 'payment_term.deleted', entityType: 'PaymentTerm', entityId: id, before });
  });
}
