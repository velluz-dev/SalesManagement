import { z } from 'zod';
import { listQuery } from '../../lib/pagination';
import { dateOnly, uuid } from '../../lib/validation';

export const auditQuery = listQuery(['createdAt'] as const).extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
  actorId: uuid.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
