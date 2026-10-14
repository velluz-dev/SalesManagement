import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { requiredText, uuid } from '../../lib/validation';

const teamInclude = {
  manager: { select: { id: true, name: true, email: true } },
  members: { select: { id: true, name: true, email: true, isActive: true }, orderBy: { name: 'asc' } },
} as const;

export const teamSchema = z.strictObject({
  name: requiredText(80, 'Team name'),
  managerId: uuid.nullable().optional(),
  memberIds: z.array(uuid).max(200).optional(),
});
export const updateTeamSchema = teamSchema.partial();

async function assertActiveUsers(ids: string[]) {
  if (!ids.length) return;
  const count = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
  if (count !== new Set(ids).size) throw badRequest('Manager and members must be existing active users');
}

export async function listTeams() {
  return prisma.team.findMany({ include: teamInclude, orderBy: { name: 'asc' } });
}

export async function getTeam(id: string) {
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!team) throw notFound('Team');
  return team;
}

export async function createTeam(actor: Actor, input: z.infer<typeof teamSchema>) {
  await assertActiveUsers([...(input.managerId ? [input.managerId] : []), ...(input.memberIds ?? [])]);
  return prisma.$transaction(async (tx) => {
    const t = await tx.team.create({ data: { name: input.name, managerId: input.managerId ?? null } });
    if (input.memberIds?.length) {
      await tx.user.updateMany({ where: { id: { in: input.memberIds } }, data: { teamId: t.id } });
    }
    const full = await tx.team.findUniqueOrThrow({ where: { id: t.id }, include: teamInclude });
    await audit(tx, actor, { action: 'team.created', entityType: 'Team', entityId: t.id, after: full });
    return full;
  });
}

export async function updateTeam(actor: Actor, id: string, input: z.infer<typeof updateTeamSchema>) {
  const before = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!before) throw notFound('Team');
  await assertActiveUsers([...(input.managerId ? [input.managerId] : []), ...(input.memberIds ?? [])]);
  return prisma.$transaction(async (tx) => {
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
}

export async function deleteTeam(actor: Actor, id: string) {
  const before = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!before) throw notFound('Team');
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
    await tx.team.delete({ where: { id } });
    await audit(tx, actor, { action: 'team.deleted', entityType: 'Team', entityId: id, before });
  });
}
