import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { loginLimiter, sensitiveLimiter } from '../../middleware/security';
import { createSession, clearSessionCookie, revokeUserSessions, SESSION_COOKIE, hashToken } from '../../lib/session';
import { hashPassword, verifyPassword, getDummyHash } from '../../lib/password';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { unauthorized, badRequest } from '../../lib/errors';
import { password } from '../../lib/validation';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
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

  await createSession(res, user.id, { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(prisma, { user: { id: user.id }, ip: req.ip, userAgent: req.get('user-agent') }, {
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id,
  });
  res.json({ data: { ok: true } });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  const a = req.auth!;
  const team = a.user.teamId
    ? await prisma.team.findUnique({ where: { id: a.user.teamId }, select: { id: true, name: true } })
    : null;
  res.json({
    data: {
      user: { ...a.user, team },
      roles: a.roles,
      permissions: [...a.permissions].sort(),
      managedTeamIds: a.managedTeamIds,
    },
  });
});

const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, { message: 'New password must differ from the current one', path: ['newPassword'] });

authRouter.post('/change-password', authenticate, sensitiveLimiter, async (req, res) => {
  const actor = getActor(req);
  const input = changePasswordSchema.parse(req.body);
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
  res.json({ data: { ok: true } });
});
