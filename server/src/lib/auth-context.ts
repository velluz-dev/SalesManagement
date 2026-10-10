import type { Request } from 'express';
import { resolveScope, type Scope, type ScopedResource } from '../shared';
import { forbidden, unauthorized } from './errors';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
  teamId: string | null;
  mustChangePassword: boolean;
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
  roles: string[];
  permissions: Set<string>;
  managedTeamIds: string[];
  teamMemberIds: string[];
}

export interface Actor extends AuthContext {
  ip?: string;
  userAgent?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function getActor(req: Request): Actor {
  if (!req.auth) throw unauthorized();
  return { ...req.auth, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) };
}

export const hasPermission = (a: AuthContext, p: string) => a.permissions.has(p);

export function scopeFor(a: AuthContext, resource: ScopedResource): Scope {
  const s = resolveScope(a.permissions, resource);
  if (!s) throw forbidden();
  return s;
}

export function ownerWhere(a: AuthContext, resource: ScopedResource, field = 'ownerId'): Record<string, unknown> {
  const scope = scopeFor(a, resource);
  if (scope === 'all') return {};
  if (scope === 'team') return { [field]: { in: a.teamMemberIds } };
  return { [field]: a.user.id };
}

export function canAccessOwner(a: AuthContext, resource: ScopedResource, ownerId: string | null | undefined): boolean {
  const scope = resolveScope(a.permissions, resource);
  if (!scope) return false;
  if (scope === 'all') return true;
  if (!ownerId) return false;
  if (scope === 'team') return a.teamMemberIds.includes(ownerId);
  return ownerId === a.user.id;
}
