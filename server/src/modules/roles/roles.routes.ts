import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_GROUPS } from '@crm/shared';
import { prisma, Prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { sensitiveLimiter } from '../../middleware/security';
import { getActor, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, forbidden, notFound, unprocessable } from '../../lib/errors';
import { idParams, optionalText, requiredText } from '../../lib/validation';

export const rolesRouter = Router();

const roleInclude = {
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;
const toRoleDto = (r: RoleRow) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  userCount: r._count.users,
  permissions: r.permissions.map((p) => p.permission.code).sort(),
});

rolesRouter.get('/', requirePermission('role.read'), async (_req, res) => {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { name: 'asc' } });
  res.json({ data: roles.map(toRoleDto) });
});

/** Permission catalogue, grouped, for the role editor. */
rolesRouter.get('/permissions', requirePermission('role.read'), (_req, res) => {
  res.json({ data: PERMISSION_GROUPS });
});

const permissionCodes = z.array(z.string().max(64)).max(200);

async function resolvePermissionIds(codes: string[]) {
  const unique = [...new Set(codes)];
  const perms = await prisma.permission.findMany({ where: { code: { in: unique } }, select: { id: true, code: true } });
  if (perms.length !== unique.length) {
    const known = new Set(perms.map((p) => p.code));
    throw badRequest('Unknown permission codes', unique.filter((c) => !known.has(c)));
  }
  return perms.map((p) => p.id);
}

const createRoleSchema = z.strictObject({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,40}$/, 'Use UPPER_SNAKE_CASE (3–40 chars)'),
  name: requiredText(80, 'Name'),
  description: optionalText(300),
  permissions: permissionCodes.default([]),
});

rolesRouter.post('/', requirePermission('role.manage'), async (req, res) => {
  const actor = getActor(req);
  const input = createRoleSchema.parse(req.body);
  const permissionIds = await resolvePermissionIds(input.permissions);
  const role = await prisma.$transaction(async (tx) => {
    const r = await tx.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: roleInclude,
    });
    await audit(tx, actor, { action: 'role.created', entityType: 'Role', entityId: r.id, after: toRoleDto(r) });
    return r;
  });
  res.status(201).json({ data: toRoleDto(role) });
});

const updateRoleSchema = z.strictObject({
  name: requiredText(80, 'Name').optional(),
  description: optionalText(300),
  permissions: permissionCodes.optional(),
});

/** Anti-escalation: nobody may edit the permission set of a role they currently hold. */
function assertNotOwnRole(actor: Actor, roleCode: string) {
  if (actor.roles.includes(roleCode)) throw forbidden('You cannot modify a role that is assigned to you');
}

rolesRouter.patch('/:id', requirePermission('role.manage'), sensitiveLimiter, async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = updateRoleSchema.parse(req.body);
  const existing = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!existing) throw notFound('Role');
  assertNotOwnRole(actor, existing.code);
  const permissionIds = input.permissions ? await resolvePermissionIds(input.permissions) : undefined;

  const role = await prisma.$transaction(async (tx) => {
    if (permissionIds) {
      await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: permissionIds } } });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      });
      const admins = await tx.user.count({
        where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { code: 'role.manage' } } } } } } },
      });
      if (admins < 1) throw unprocessable('At least one active user must keep role-management permission');
    }
    const r = await tx.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: roleInclude,
    });
    await audit(tx, actor, {
      action: 'role.updated',
      entityType: 'Role',
      entityId: id,
      before: toRoleDto(existing),
      after: toRoleDto(r),
    });
    return r;
  });
  res.json({ data: toRoleDto(role) });
});

rolesRouter.delete('/:id', requirePermission('role.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const existing = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!existing) throw notFound('Role');
  if (existing.isSystem) throw unprocessable('System roles cannot be deleted');
  if (existing._count.users > 0) throw unprocessable('Remove this role from all users before deleting it');
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await audit(tx, actor, { action: 'role.deleted', entityType: 'Role', entityId: id, before: toRoleDto(existing) });
  });
  res.status(204).end();
});
