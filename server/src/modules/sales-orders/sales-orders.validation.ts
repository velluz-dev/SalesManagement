import { z } from 'zod';
import { SALES_ORDER_STATUSES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { dateOnly, optionalText, requiredText, uuid } from '../../lib/validation';
import { lineItemSchema } from '../quotations/quotations.validation';

export const listOrdersQuery = listQuery(['createdAt', 'orderDate', 'deliveryDate', 'total', 'number'] as const).extend({
  status: z.enum(SALES_ORDER_STATUSES).optional(),
  customerId: uuid.optional(),
  contractId: uuid.optional(),
  ownerId: uuid.optional(),
});

const common = {
  orderDate: dateOnly.optional(),
  deliveryDate: dateOnly.optional().nullable(),
  notes: optionalText(4000),
};

export const createOrderSchema = z.union([
  z.strictObject({ contractId: uuid, ...common }),
  z.strictObject({ quotationId: uuid, ...common }),
  z.strictObject({ customerId: uuid, items: z.array(lineItemSchema).min(1, 'Add at least one line item').max(200), ...common }),
]);

export const updateOrderSchema = z.strictObject({
  deliveryDate: dateOnly.optional().nullable(),
  notes: optionalText(4000),
  items: z.array(lineItemSchema).min(1).max(200).optional(),
});

export const cancelOrderSchema = z.strictObject({ reason: requiredText(500, 'Cancellation reason') });
export const deliverOrderSchema = z.strictObject({ deliveryDate: dateOnly.optional() });
