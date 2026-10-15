import { z } from 'zod';
import { QUOTATION_STATUSES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, dateOnly, money, optionalText, percent, quantity, requiredText, uuid } from '../../lib/validation';

export const lineItemSchema = z.strictObject({
  productId: uuid.optional().nullable(),
  description: requiredText(500, 'Description'),
  quantity,
  unitPrice: money,
  discountPercent: percent.default(0),
  taxRate: percent.optional(),
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

export const listQuotationsQuery = listQuery(['createdAt', 'updatedAt', 'total', 'validUntil', 'number'] as const).extend({
  status: z.enum(QUOTATION_STATUSES).optional(),
  customerId: uuid.optional(),
  ownerId: uuid.optional(),
  opportunityId: uuid.optional(),
  includeSuperseded: booleanQuery,
});

export const createQuotationSchema = z.strictObject({
  customerId: uuid,
  opportunityId: uuid.optional().nullable(),
  validUntil: dateOnly.optional(),
  notes: optionalText(4000),
  terms: optionalText(4000),
  paymentTermId: uuid.optional().nullable(),
  items: z.array(lineItemSchema).min(1, 'Add at least one line item').max(100),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = createQuotationSchema.partial();
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const commentSchema = z.strictObject({ comment: optionalText(2000) });

export const customerResponseSchema = z.strictObject({
  outcome: z.enum(['ACCEPTED', 'DECLINED']),
  comment: optionalText(2000),
});
