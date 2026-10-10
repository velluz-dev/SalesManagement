import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../shared';
import { resolveSession, SESSION_COOKIE, clearSessionCookie } from '../lib/session';
import { forbidden, unauthorized } from '../lib/errors';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return next(unauthorized());
  const ctx = await resolveSession(token);
  if (!ctx) {
    clearSessionCookie(res);
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
  req.auth = ctx;
  next();
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    const missing = perms.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length) return next(forbidden());
    next();
  };
}

export function requireAnyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!perms.some((p) => req.auth!.permissions.has(p))) return next(forbidden());
    next();
  };
}
