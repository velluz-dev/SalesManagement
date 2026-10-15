import { z } from 'zod';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, money, optionalText, uuid } from '../../lib/validation';

export const listCreditQuery = listQuery(['name'] as const).extend({
  onHold: booleanQuery,
  overLimit: booleanQuery,
});

export const creditSchema = z.strictObject({
  creditLimit: money,
  paymentTermId: uuid.nullable().optional(),
  onHold: z.boolean().default(false),
  notes: optionalText(1000),
});
