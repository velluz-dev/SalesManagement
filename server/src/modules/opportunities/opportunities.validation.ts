import { z } from 'zod';
import { OPPORTUNITY_STAGES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { dateOnly, money, optionalText, requiredText, uuid } from '../../lib/validation';

export const listOpportunitiesQuery = listQuery(['createdAt', 'expectedCloseDate', 'amount', 'name', 'updatedAt'] as const).extend({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  customerId: uuid.optional(),
  ownerId: uuid.optional(),
});

export const createOpportunitySchema = z.strictObject({
  name: requiredText(160, 'Name'),
  customerId: uuid,
  stage: z.enum(OPPORTUNITY_STAGES).default('PROSPECTING'),
  amount: money,
  probability: z.coerce.number().int().min(0).max(100).default(10),
  expectedCloseDate: dateOnly.optional().nullable(),
  notes: optionalText(2000),
  ownerId: uuid.optional(),
});
export const updateOpportunitySchema = createOpportunitySchema.partial();
