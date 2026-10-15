import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { revokeUserSessions, hashToken } from '../../lib/session';
import { hashPassword, verifyPassword, getDummyHash } from '../../lib/password';
import type { Actor, AuthContext } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { unauthorized, badRequest } from '../../lib/errors';
import { changePasswordSchema, loginSchema } from './auth.validation';

export async function verifyLogin(input: z.infer<typeof loginSchema>) {
  const where = input.identifier.includes('@') ? { email: input.identifier } : { username: input.identifier };
  const user = await prisma.user.findUnique({ where });

  const ok = user ? await verifyPassword(user.passwordHash, input.password) : (await verifyPassword(await getDummyHash(), input.password), false);

  if (!user || !ok || !user.isActive) {
    await audit(prisma, null, {
      action: 'auth.login_failed',
      entityType: 'User',
      entityId: user?.id,
      after: { identifier: input.identifier, reason: !user ? 'unknown_user' : !ok ? 'bad_password' : 'inactive' },
    });
    throw unauthorized('Incorrect email, username or password');
  }
  return user;
}

export async function recordLogin(userId: string, meta: { ip?: string; userAgent?: string }) {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await audit(prisma, { user: { id: userId }, ip: meta.ip, userAgent: meta.userAgent }, {
    action: 'auth.login',
    entityType: 'User',
    entityId: userId,
  });
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function getMe(a: AuthContext) {
  const team = a.user.teamId
    ? await prisma.team.findUnique({ where: { id: a.user.teamId }, select: { id: true, name: true } })
    : null;
  return {
    user: { ...a.user, team },
    roles: a.roles,
    permissions: [...a.permissions].sort(),
    managedTeamIds: a.managedTeamIds,
  };
}

export async function changePassword(actor: Actor, input: z.infer<typeof changePasswordSchema>) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw badRequest('Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  });
  await revokeUserSessions(user.id, actor.sessionId);
  await audit(prisma, actor, { action: 'auth.password_changed', entityType: 'User', entityId: user.id });
}
