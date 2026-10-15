import { z } from 'zod';
import { PAYMENT_METHODS } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, dateOnly, optionalText, positiveMoney, requiredText, uuid } from '../../lib/validation';

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
