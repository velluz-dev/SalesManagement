import { z } from 'zod';
import { optionalText, requiredText } from '../../lib/validation';

const permissionCodes = z.array(z.string().max(64)).max(200);

export const createRoleSchema = z.strictObject({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,40}$/, 'Use UPPER_SNAKE_CASE, 3 to 40 characters'),
  name: requiredText(80, 'Name'),
  description: optionalText(300),
  permissions: permissionCodes.default([]),
});

export const updateRoleSchema = z.strictObject({
  name: requiredText(80, 'Name').optional(),
  description: optionalText(300),
  permissions: permissionCodes.optional(),
});
