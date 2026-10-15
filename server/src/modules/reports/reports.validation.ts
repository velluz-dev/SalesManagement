import { z } from 'zod';
import { dateOnly } from '../../lib/validation';
import { addDays, startOfTodayUtc } from '../../lib/dates';

export const rangeQuery = z
  .object({ from: dateOnly.optional(), to: dateOnly.optional() })
  .transform((v) => {
    const to = v.to ?? startOfTodayUtc();
    const from = v.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    return { from, to, toExclusive: addDays(to, 1) };
  })
  .refine((v) => v.from <= v.to, 'from must be before to');
