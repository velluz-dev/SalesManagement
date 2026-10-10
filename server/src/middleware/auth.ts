import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@crm/shared';
import { resolveSession, SESSION_COOKIE, clearSessionCookie } from '../lib/session';
import { forbidden, unauthorized } from '../lib/errors';

/** Requires a valid session; populates `req.auth`. */
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

/** Requires ALL listed permissions. */
export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    const missing = perms.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length) return next(forbidden());
    next();
  };
}

/** Requires AT LEAST ONE of the listed permissions (e.g. any read scope). */
export function requireAnyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!perms.some((p) => req.auth!.permissions.has(p))) return next(forbidden());
    next();
  };
}
