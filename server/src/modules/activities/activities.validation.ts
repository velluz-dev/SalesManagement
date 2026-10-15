import { z } from 'zod';
import { ACTIVITY_TYPES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { optionalText, requiredText, uuid } from '../../lib/validation';

export const listActivitiesQuery = listQuery(['dueAt', 'createdAt'] as const).extend({
  type: z.enum(ACTIVITY_TYPES).optional(),
  state: z.enum(['open', 'completed', 'overdue']).optional(),
  ownerId: uuid.optional(),
  customerId: uuid.optional(),
  leadId: uuid.optional(),
  opportunityId: uuid.optional(),
});

export const createActivitySchema = z.strictObject({
  type: z.enum(ACTIVITY_TYPES),
  subject: requiredText(200, 'Subject'),
  description: optionalText(4000),
  dueAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).optional().nullable(),
  customerId: uuid.optional().nullable(),
  leadId: uuid.optional().nullable(),
  opportunityId: uuid.optional().nullable(),
  ownerId: uuid.optional(),
  completed: z.boolean().optional(),
});
export const updateActivitySchema = createActivitySchema.partial();
