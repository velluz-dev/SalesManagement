import { z } from 'zod';
import { APPROVAL_STATUSES, APPROVER_TYPES } from '../../shared';
import { listQuery } from '../../lib/pagination';
import { money, optionalText, requiredText, uuid } from '../../lib/validation';

export const listApprovalsQuery = listQuery(['createdAt', 'amount', 'decidedAt'] as const).extend({
  status: z.enum(APPROVAL_STATUSES).optional(),
  view: z.enum(['assigned', 'all']).default('assigned'),
});

export const decisionSchema = z
  .strictObject({ decision: z.enum(['APPROVE', 'REJECT']), comment: optionalText(2000) })
  .refine((v) => v.decision === 'APPROVE' || (v.comment && v.comment.length >= 3), {
    message: 'A rejection reason is required',
    path: ['comment'],
  });

export const ruleSchema = z
  .strictObject({
    name: requiredText(120, 'Name'),
    minAmount: money,
    maxAmount: money.nullable().optional(),
    approverType: z.enum(APPROVER_TYPES),
    approverRoleId: uuid,
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((r) => r.maxAmount == null || Number(r.maxAmount) > Number(r.minAmount), {
    message: 'Maximum must be greater than minimum',
    path: ['maxAmount'],
  });
