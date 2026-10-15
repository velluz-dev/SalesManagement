import { z } from 'zod';
import { CUSTOMER_TYPES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, optionalEmail, optionalText, requiredText, uuid } from '../../lib/validation';

export const listCustomersQuery = listQuery(['name', 'createdAt', 'updatedAt'] as const).extend({
  ownerId: uuid.optional(),
  isActive: booleanQuery,
  industry: z.string().max(80).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
});

const customerFields = {
  name: requiredText(160, 'Customer name'),
  email: optionalEmail,
  phone: optionalText(40),
  industry: optionalText(80),
  address: optionalText(400),
  taxId: optionalText(60),
  type: z.enum(CUSTOMER_TYPES).optional(),
};

export const createCustomerSchema = z.strictObject({ ...customerFields, ownerId: uuid.optional() });
export const updateCustomerSchema = createCustomerSchema.partial().extend({ isActive: z.boolean().optional() });
