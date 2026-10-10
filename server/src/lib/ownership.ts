import type { Actor } from './auth-context';
import type { Db } from './prisma';
import { badRequest, forbidden } from './errors';

/**
 * Determines the owner of a new/re-assigned record. Owners are never taken from the client
 * unless the actor holds `lead.assign` (record re-assignment) and the target is in their team.
 */
export async function resolveOwnerId(db: Db, actor: Actor, requested: string | null | undefined): Promise<string> {
  if (!requested || requested === actor.user.id) return actor.user.id;
  if (!actor.permissions.has('lead.assign')) throw forbidden('You are not allowed to assign records to other users');
  if (!actor.teamMemberIds.includes(requested)) throw forbidden('You can only assign records to members of your team');
  const user = await db.user.findUnique({ where: { id: requested }, select: { isActive: true } });
  if (!user?.isActive) throw badRequest('The selected owner is not an active user');
  return requested;
}

export const ownerSelect = { select: { id: true, name: true, email: true } } as const;
