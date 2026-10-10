import { z } from 'zod';

export const uuid = z.uuid('Invalid identifier');
export const idParams = z.object({ id: uuid });

/** Money input: number or numeric string, ≥ 0, max 2 decimals, fits NUMERIC(14,2). Output: string. */
export const money = z
  .union([z.number(), z.string().trim()])
  .transform((v) => (typeof v === 'number' ? v.toString() : v))
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Must be a non-negative amount with at most 2 decimals');

export const positiveMoney = money.refine((v) => Number(v) > 0, 'Must be greater than zero');

export const percent = z.coerce.number().min(0, 'Must be ≥ 0').max(100, 'Must be ≤ 100');

export const quantity = z
  .union([z.number(), z.string().trim()])
  .transform((v) => (typeof v === 'number' ? v.toString() : v))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Quantity must be greater than zero (max 2 decimals)');

/** Calendar date as YYYY-MM-DD → Date (UTC midnight). */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const requiredText = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address')).pipe(z.string().max(254));

export const optionalEmail = z
  .union([z.literal(''), email])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Password policy: 10–128 chars with at least one letter and one digit. */
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
