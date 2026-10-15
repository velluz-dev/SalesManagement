import { z } from 'zod';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { dateOnly, money, optionalEmail, optionalText, requiredText, uuid } from '../../lib/validation';

export const listLeadsQuery = listQuery(['createdAt', 'updatedAt', 'title', 'estimatedValue', 'nextFollowUpAt'] as const).extend({
  status: z.enum(LEAD_STATUSES).optional(),
  followUp: z.enum(['due', 'overdue']).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  ownerId: uuid.optional(),
});

export const createLeadSchema = z.strictObject({
  title: requiredText(160, 'Title'),
  contactName: requiredText(120, 'Contact name'),
  company: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  source: z.enum(LEAD_SOURCES).default('OTHER'),
  status: z.enum(LEAD_STATUSES).exclude(['CONVERTED']).default('NEW'),
  estimatedValue: money.optional().nullable(),
  notes: optionalText(2000),
  nextFollowUpAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).optional().nullable(),
  ownerId: uuid.optional(),
});
export const updateLeadSchema = createLeadSchema.partial();

export const convertLeadSchema = z
  .strictObject({
    customerId: uuid.optional(),
    customer: z
      .strictObject({ name: requiredText(160, 'Customer name'), email: optionalEmail, phone: optionalText(40), industry: optionalText(80) })
      .optional(),
    opportunity: z
      .strictObject({ name: requiredText(160, 'Opportunity name'), amount: money, expectedCloseDate: dateOnly.optional() })
      .optional(),
  })
  .refine((v) => !!v.customerId !== !!v.customer, { message: 'Provide either an existing customer or new customer details' });
