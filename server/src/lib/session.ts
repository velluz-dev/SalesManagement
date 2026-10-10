import crypto from 'node:crypto';
import type { Response, CookieOptions } from 'express';
import { env } from '../config/env';
import { prisma } from './prisma';
import type { AuthContext } from './auth-context';

export const SESSION_COOKIE = env.COOKIE_SECURE ? '__Host-crm_sid' : 'crm_sid';

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
  };
}

export async function createSession(res: Response, userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + env.SESSION_ABSOLUTE_HOURS * 3_600_000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  return session;
}

export function clearSessionCookie(res: Response) {
  const { maxAge: _ignored, ...opts } = cookieOptions();
  res.clearCookie(SESSION_COOKIE, opts);
}

export async function resolveSession(token: string): Promise<AuthContext | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          managedTeams: { select: { id: true, members: { select: { id: true } } } },
        },
      },
    },
  });
  if (!session) return null;

  const now = Date.now();
  const idleExpired = now - session.lastSeenAt.getTime() > env.SESSION_IDLE_MINUTES * 60_000;
  if (session.expiresAt.getTime() <= now || idleExpired || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const { user } = session;
  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);

  const teamMemberIds = new Set<string>([user.id]);
  for (const t of user.managedTeams) for (const m of t.members) teamMemberIds.add(m.id);

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      teamId: user.teamId,
      mustChangePassword: user.mustChangePassword,
    },
    roles: user.roles.map((r) => r.role.code),
    permissions,
    managedTeamIds: user.managedTeams.map((t) => t.id),
    teamMemberIds: [...teamMemberIds],
  };
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
