import type { Request } from 'express';
import { resolveScope, type Scope, type ScopedResource } from '@crm/shared';
import { forbidden, unauthorized } from './errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string | null;
  mustChangePassword: boolean;
}

/** Everything authorization needs, resolved once per request from the session. */
export interface AuthContext {
  sessionId: string;
  user: AuthUser;
  roles: string[];
  permissions: Set<string>;
  /** Teams this user manages. */
  managedTeamIds: string[];
  /** Users in managed teams, always including the user themself. */
  teamMemberIds: string[];
}

/** AuthContext plus request metadata, passed to services for scoping and audit logging. */
export interface Actor extends AuthContext {
  ip?: string;
  userAgent?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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

/** Widest data scope for a resource; throws 403 when the user has no read access at all. */
export function scopeFor(a: AuthContext, resource: ScopedResource): Scope {
  const s = resolveScope(a.permissions, resource);
  if (!s) throw forbidden();
  return s;
}

/**
 * Prisma `where` fragment restricting records to those the actor may see, by owner column.
 * Applied inside every list/get/update query, so out-of-scope rows are never returned.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ownerWhere(a: AuthContext, resource: ScopedResource, field = 'ownerId'): Record<string, any> {
  const scope = scopeFor(a, resource);
  if (scope === 'all') return {};
  if (scope === 'team') return { [field]: { in: a.teamMemberIds } };
  return { [field]: a.user.id };
}

/** True when `ownerId` is within the actor's scope for the resource. */
export function canAccessOwner(a: AuthContext, resource: ScopedResource, ownerId: string | null | undefined): boolean {
  const scope = resolveScope(a.permissions, resource);
  if (!scope) return false;
  if (scope === 'all') return true;
  if (!ownerId) return false;
  if (scope === 'team') return a.teamMemberIds.includes(ownerId);
  return ownerId === a.user.id;
}
