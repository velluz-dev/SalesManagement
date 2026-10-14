import { z } from 'zod';
import { PAYMENT_METHODS } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged } from '../../lib/pagination';
import { booleanQuery, dateOnly, optionalText, positiveMoney, requiredText, uuid } from '../../lib/validation';
import { ownerSelect } from '../../lib/ownership';
import { startOfTodayUtc } from '../../lib/dates';

export const listPaymentsQuery = listQuery(['paidAt', 'amount', 'createdAt'] as const).extend({
  invoiceId: uuid.optional(),
  customerId: uuid.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  includeVoided: booleanQuery,
});

export const createPaymentSchema = z.strictObject({
  invoiceId: uuid,
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paidAt: dateOnly,
  notes: optionalText(1000),
});

export const voidPaymentSchema = z.strictObject({ reason: requiredText(500, 'Void reason') });

function statusFor(total: Prisma.Decimal, paid: Prisma.Decimal) {
  if (paid.lte(0)) return 'ISSUED' as const;
  if (paid.gte(total)) return 'PAID' as const;
  return 'PARTIALLY_PAID' as const;
}

const include = {
  invoice: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
  recordedBy: ownerSelect,
  voidedBy: ownerSelect,
} satisfies Prisma.PaymentInclude;

export async function listPayments(q: z.infer<typeof listPaymentsQuery>) {
  const where: Prisma.PaymentWhereInput = {
    AND: [
      q.includeVoided ? {} : { voidedAt: null },
      q.invoiceId ? { invoiceId: q.invoiceId } : {},
      q.customerId ? { invoice: { customerId: q.customerId } } : {},
      q.method ? { method: q.method } : {},
      q.from ? { paidAt: { gte: q.from } } : {},
      q.to ? { paidAt: { lte: q.to } } : {},
      q.q ? { OR: [{ reference: contains(q.q) }, { invoice: { number: contains(q.q) } }, { invoice: { customer: { name: contains(q.q) } } }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, include, orderBy: { [q.sort]: q.order }, ...pageArgs(q) }),
    prisma.payment.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function recordPayment(actor: Actor, input: z.infer<typeof createPaymentSchema>) {
  if (input.paidAt > startOfTodayUtc()) throw badRequest('Payment date cannot be in the future');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${input.invoiceId}::uuid FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'ISSUED' && inv.status !== 'PARTIALLY_PAID') throw unprocessable('Payments can only be recorded against issued, unpaid invoices');
    const balance = inv.total.sub(inv.amountPaid);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.gt(balance)) throw unprocessable(`Payment exceeds the outstanding balance of ${balance.toFixed(2)}`);
    const p = await tx.payment.create({ data: { ...input, recordedById: actor.user.id }, include });
    const paid = inv.amountPaid.add(amount);
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: statusFor(inv.total, paid) } });
    await audit(tx, actor, {
      action: 'payment.recorded',
      entityType: 'Payment',
      entityId: p.id,
      after: { ...input, invoiceNumber: inv.number, invoiceStatus: statusFor(inv.total, paid), amountPaid: paid },
    });
    return p;
  });
}

export async function voidPayment(actor: Actor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id } });
    if (!p) throw notFound('Payment');
    if (p.voidedAt) throw unprocessable('Payment is already void');
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${p.invoiceId}::uuid FOR UPDATE`;
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: p.invoiceId } });
    const paid = inv.amountPaid.sub(p.amount);
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: statusFor(inv.total, paid) } });
    const updated = await tx.payment.update({
      where: { id },
      data: { voidedAt: new Date(), voidedById: actor.user.id, voidReason: reason },
      include,
    });
    await audit(tx, actor, {
      action: 'payment.voided',
      entityType: 'Payment',
      entityId: id,
      before: { amount: p.amount, invoiceStatus: inv.status },
      after: { reason, invoiceStatus: statusFor(inv.total, paid), amountPaid: paid },
    });
    return updated;
  });
}
