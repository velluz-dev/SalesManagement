import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { contains, pageArgs, paged } from '../../lib/pagination';
import { addDays } from '../../lib/dates';
import { auditQuery } from './audit.validation';

export async function listAuditLogs(q: z.infer<typeof auditQuery>) {
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
  return paged(rows, total, q);
}

export async function auditFacets() {
  const [actions, entities] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ]);
  return { actions: actions.map((a) => a.action), entityTypes: entities.map((e) => e.entityType) };
}
