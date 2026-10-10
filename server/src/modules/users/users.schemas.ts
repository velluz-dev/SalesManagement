import { z } from 'zod';
import { listQuery } from '../../lib/pagination';
import { booleanQuery, email, password, requiredText, uuid } from '../../lib/validation';

export const listUsersQuery = listQuery(['createdAt', 'name', 'email', 'lastLoginAt'] as const).extend({
  isActive: booleanQuery,
  roleId: uuid.optional(),
  teamId: uuid.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export const createUserSchema = z.strictObject({
  email,
  name: requiredText(120, 'Name'),
  password,
  teamId: uuid.nullable().optional(),
  roleIds: z.array(uuid).max(10).default([]),
  mustChangePassword: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.strictObject({
  email: email.optional(),
  name: requiredText(120, 'Name').optional(),
  teamId: uuid.nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setRolesSchema = z.strictObject({ roleIds: z.array(uuid).max(10) });
export const setStatusSchema = z.strictObject({ isActive: z.boolean() });
export const resetPasswordSchema = z.strictObject({ password });
