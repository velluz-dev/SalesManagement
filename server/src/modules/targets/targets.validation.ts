import { z } from 'zod';
import { TARGET_PERIOD_TYPES } from '../../shared';
import { paginationQuery } from '../../lib/pagination';
import { money, optionalText, uuid } from '../../lib/validation';

export const listTargetsQuery = paginationQuery.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  periodType: z.enum(TARGET_PERIOD_TYPES).optional(),
  userId: uuid.optional(),
  teamId: uuid.optional(),
  current: z.enum(['true', 'false']).optional(),
});

export const targetSchema = z
  .strictObject({
    userId: uuid.optional().nullable(),
    teamId: uuid.optional().nullable(),
    periodType: z.enum(TARGET_PERIOD_TYPES),
    year: z.coerce.number().int().min(2000).max(2100),
    period: z.coerce.number().int().min(1).max(12).default(1),
    amount: money,
    notes: optionalText(1000),
  })
  .refine((v) => !!v.userId !== !!v.teamId, { message: 'Choose either a salesperson or a team', path: ['userId'] })
  .refine((v) => v.periodType !== 'QUARTER' || v.period <= 4, { message: 'Quarter must be between 1 and 4', path: ['period'] });
