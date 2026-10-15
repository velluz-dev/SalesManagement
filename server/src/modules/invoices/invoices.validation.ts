import { z } from 'zod';
import { INVOICE_STATUSES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, dateOnly, optionalText, requiredText, uuid } from '../../lib/validation';
import { lineItemSchema } from '../quotations/quotations.validation';

export const listInvoicesQuery = listQuery(['createdAt', 'dueDate', 'issueDate', 'total', 'number'] as const).extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: uuid.optional(),
  overdue: booleanQuery,
  unpaid: booleanQuery,
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const createInvoiceSchema = z.union([
  z.strictObject({ quotationId: uuid, notes: optionalText(4000) }),
  z.strictObject({ salesOrderId: uuid, notes: optionalText(4000) }),
  z.strictObject({
    customerId: uuid,
    salespersonId: uuid.optional().nullable(),
    notes: optionalText(4000),
    items: z.array(lineItemSchema).min(1, 'Add at least one line item').max(100),
  }),
]);

export const updateInvoiceSchema = z.strictObject({
  notes: optionalText(4000),
  items: z.array(lineItemSchema).min(1).max(100).optional(),
});

export const issueInvoiceSchema = z.strictObject({
  issueDate: dateOnly.optional(),
  dueDate: dateOnly.optional(),
});

export const cancelInvoiceSchema = z.strictObject({ reason: requiredText(500, 'Cancellation reason') });
