import { z } from 'zod';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, money, optionalText, requiredText } from '../../lib/validation';

export const listProductsQuery = listQuery(['name', 'code', 'listPrice', 'createdAt'] as const).extend({
  category: z.string().trim().max(80).optional(),
  isActive: booleanQuery,
});

export const productSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'Use 2 to 40 letters, numbers, dots, dashes or underscores'),
  name: requiredText(160, 'Product name'),
  unit: z.string().trim().min(1, 'Unit is required').max(20).default('unit'),
  category: optionalText(80),
  description: optionalText(1000),
  listPrice: money,
  isActive: z.boolean().default(true),
});
export const updateProductSchema = productSchema.partial();
