import { z } from 'zod';
import { booleanQuery, requiredText } from '../../lib/validation';

export const listPaymentTermsQuery = z.object({ all: booleanQuery });

export const termSchema = z.strictObject({
  name: requiredText(40, 'Name'),
  days: z.coerce.number().int().min(0, 'Use 0 to 365 days').max(365, 'Use 0 to 365 days'),
  isActive: z.boolean().default(true),
});
export const updateTermSchema = termSchema.partial();
