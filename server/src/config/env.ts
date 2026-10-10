import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5180')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(120),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  OVERDUE_SCAN_MINUTES: z.coerce.number().int().min(0).default(60),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Cookies are always Secure in production regardless of COOKIE_SECURE.
  COOKIE_SECURE: parsed.data.NODE_ENV === 'production' ? true : parsed.data.COOKIE_SECURE,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
