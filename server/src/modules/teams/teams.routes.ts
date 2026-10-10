import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { idParams, requiredText, uuid } from '../../lib/validation';

export const teamsRouter = Router();

const teamInclude = {
  manager: { select: { id: true, name: true, email: true } },
  members: { select: { id: true, name: true, email: true, isActive: true }, orderBy: { name: 'asc' } },
} as const;

teamsRouter.get('/', requirePermission('team.read'), async (_req, res) => {
  res.json({ data: await prisma.team.findMany({ include: teamInclude, orderBy: { name: 'asc' } }) });
});

teamsRouter.get('/:id', requirePermission('team.read'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!team) throw notFound('Team');
  res.json({ data: team });
});

const teamSchema = z.strictObject({
  name: requiredText(80, 'Team name'),
  managerId: uuid.nullable().optional(),
  memberIds: z.array(uuid).max(200).optional(),
});

async function assertActiveUsers(ids: string[]) {
  if (!ids.length) return;
  const count = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
  if (count !== new Set(ids).size) throw badRequest('Manager and members must be existing active users');
}

teamsRouter.post('/', requirePermission('team.manage'), async (req, res) => {
  const actor = getActor(req);
  const input = teamSchema.parse(req.body);
  await assertActiveUsers([...(input.managerId ? [input.managerId] : []), ...(input.memberIds ?? [])]);
  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({ data: { name: input.name, managerId: input.managerId ?? null } });
    if (input.memberIds?.length) {
      await tx.user.updateMany({ where: { id: { in: input.memberIds } }, data: { teamId: t.id } });
    }
    const full = await tx.team.findUniqueOrThrow({ where: { id: t.id }, include: teamInclude });
    await audit(tx, actor, { action: 'team.created', entityType: 'Team', entityId: t.id, after: full });
    return full;
  });
  res.status(201).json({ data: team });
});

teamsRouter.patch('/:id', requirePermission('team.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = teamSchema.partial().parse(req.body);
  const before = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!before) throw notFound('Team');
  await assertActiveUsers([...(input.managerId ? [input.managerId] : []), ...(input.memberIds ?? [])]);
  const team = await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
      },
    });
    if (input.memberIds) {
      await tx.user.updateMany({ where: { teamId: id, id: { notIn: input.memberIds } }, data: { teamId: null } });
      await tx.user.updateMany({ where: { id: { in: input.memberIds } }, data: { teamId: id } });
    }
    const full = await tx.team.findUniqueOrThrow({ where: { id }, include: teamInclude });
    await audit(tx, actor, { action: 'team.updated', entityType: 'Team', entityId: id, before, after: full });
    return full;
  });
  res.json({ data: team });
});

teamsRouter.delete('/:id', requirePermission('team.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const before = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!before) throw notFound('Team');
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
    await tx.team.delete({ where: { id } });
    await audit(tx, actor, { action: 'team.deleted', entityType: 'Team', entityId: id, before });
  });
  res.status(204).end();
});
