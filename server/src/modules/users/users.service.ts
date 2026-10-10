import { prisma, type Db, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { hashPassword } from '../../lib/password';
import { revokeUserSessions } from '../../lib/session';
import { badRequest, forbidden, notFound, unprocessable } from '../../lib/errors';
import { pageArgs, paged, contains } from '../../lib/pagination';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas';

export const userSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true } },
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const toUserDto = (u: UserRow) => ({ ...u, roles: u.roles.map((r) => r.role) });

export async function listUsers(q: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(q.q ? { OR: [{ name: contains(q.q) }, { email: contains(q.q) }] } : {}),
    ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
    ...(q.roleId ? { roles: { some: { roleId: q.roleId } } } : {}),
    ...(q.teamId ? { teamId: q.teamId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { [q.sort]: q.order }, ...pageArgs(q) }),
    prisma.user.count({ where }),
  ]);
  return paged(rows.map(toUserDto), total, q);
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!u) throw notFound('User');
  return toUserDto(u);
}

/**
 * Ensures at least one active user keeps `role.manage` after a change, so the system can never be
 * locked out of administration.
 */
async function assertAdminRemains(db: Db) {
  const count = await db.user.count({
    where: {
      isActive: true,
      roles: { some: { role: { permissions: { some: { permission: { code: 'role.manage' } } } } } },
    },
  });
  if (count < 1) throw unprocessable('At least one active user must keep role-management permission');
}

async function assertRolesExist(db: Db, roleIds: string[]) {
  const found = await db.role.count({ where: { id: { in: roleIds } } });
  if (found !== new Set(roleIds).size) throw badRequest('One or more roles do not exist');
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  if (input.roleIds.length && !actor.permissions.has('role.assign')) {
    throw forbidden('You are not allowed to assign roles');
  }
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    if (input.roleIds.length) await assertRolesExist(tx, input.roleIds);
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        teamId: input.teamId ?? null,
        mustChangePassword: input.mustChangePassword,
        roles: { create: input.roleIds.map((roleId) => ({ roleId, grantedById: actor.user.id })) },
      },
      select: userSelect,
    });
    const dto = toUserDto(user);
    await audit(tx, actor, { action: 'user.created', entityType: 'User', entityId: user.id, after: dto });
    return dto;
  });
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (!before) throw notFound('User');
    const user = await tx.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      },
      select: userSelect,
    });
    const dto = toUserDto(user);
    await audit(tx, actor, { action: 'user.updated', entityType: 'User', entityId: id, before: toUserDto(before), after: dto });
    return dto;
  });
}

export async function setUserRoles(actor: Actor, id: string, roleIds: string[]) {
  if (id === actor.user.id) throw forbidden('You cannot change your own roles');
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (!before) throw notFound('User');
    await assertRolesExist(tx, roleIds);
    await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roleIds } } });
    await tx.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId: id, roleId, grantedById: actor.user.id })),
      skipDuplicates: true,
    });
    await assertAdminRemains(tx);
    const after = toUserDto(await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect }));
    await audit(tx, actor, {
      action: 'user.roles_changed',
      entityType: 'User',
      entityId: id,
      before: { roles: toUserDto(before).roles.map((r) => r.code) },
      after: { roles: after.roles.map((r) => r.code) },
    });
    // Permission changes take effect on the next request (permissions are resolved per request).
    return after;
  });
}

export async function setUserActive(actor: Actor, id: string, isActive: boolean) {
  if (id === actor.user.id) throw forbidden('You cannot change your own account status');
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: { isActive: true } });
    if (!before) throw notFound('User');
    const user = await tx.user.update({ where: { id }, data: { isActive }, select: userSelect });
    if (!isActive) await assertAdminRemains(tx);
    await audit(tx, actor, {
      action: isActive ? 'user.activated' : 'user.deactivated',
      entityType: 'User',
      entityId: id,
      before,
      after: { isActive },
    });
    return toUserDto(user);
  });
  if (!isActive) await revokeUserSessions(id);
  return result;
}

export async function resetUserPassword(actor: Actor, id: string, password: string) {
  if (id === actor.user.id) throw badRequest('Use "change password" to change your own password');
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('User');
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await audit(tx, actor, { action: 'user.password_reset', entityType: 'User', entityId: id });
  });
  await revokeUserSessions(id);
}
