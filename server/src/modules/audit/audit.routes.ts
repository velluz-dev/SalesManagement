import { Router } from 'express';
import { prisma, Prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { contains, listQuery, pageArgs, paged } from '../../lib/pagination';
import { addDays } from '../../lib/dates';
import { dateOnly, uuid } from '../../lib/validation';
import { z } from 'zod';

export const auditRouter = Router();

const auditQuery = listQuery(['createdAt'] as const).extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
  actorId: uuid.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

auditRouter.get('/', requirePermission('audit.read'), async (req, res) => {
  const q = auditQuery.parse(req.query);
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      q.action ? { action: { startsWith: q.action } } : {},
      q.entityType ? { entityType: q.entityType } : {},
      q.entityId ? { entityId: q.entityId } : {},
      q.actorId ? { actorId: q.actorId } : {},
      q.from ? { createdAt: { gte: q.from } } : {},
      q.to ? { createdAt: { lt: addDays(q.to, 1) } } : {},
      q.q ? { OR: [{ action: contains(q.q) }, { entityType: contains(q.q) }, { entityId: contains(q.q) }, { actor: { name: contains(q.q) } }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: q.order },
      ...pageArgs(q),
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(paged(rows, total, q));
});

auditRouter.get('/facets', requirePermission('audit.read'), async (_req, res) => {
  const [actions, entities] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ]);
  res.json({ data: { actions: actions.map((a) => a.action), entityTypes: entities.map((e) => e.entityType) } });
});
