import { z } from 'zod';
import { CONTRACT_STATUSES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { dateOnly, optionalText, requiredText, uuid } from '../../lib/validation';

export const listContractsQuery = listQuery(['createdAt', 'startDate', 'endDate', 'value', 'number'] as const).extend({
  status: z.enum(CONTRACT_STATUSES).optional(),
  customerId: uuid.optional(),
  ownerId: uuid.optional(),
});

const documentUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Use a full http:// or https:// link')
  .transform((v) => (v === '' ? null : v))
  .optional()
  .nullable();

export const createContractSchema = z
  .strictObject({
    quotationId: uuid,
    title: optionalText(200),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional().nullable(),
    terms: optionalText(8000),
    documentUrl,
  })
  .refine((v) => !v.endDate || !v.startDate || v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

export const updateContractSchema = z.strictObject({
  title: requiredText(200, 'Title').optional(),
  endDate: dateOnly.optional().nullable(),
  terms: optionalText(8000),
  documentUrl,
});

export const cancelContractSchema = z.strictObject({ reason: requiredText(500, 'Cancellation reason') });
