import type { NotificationType } from '@prisma/client';
import type { Db } from './prisma';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** When set, a user receives at most one notification with this key. */
  dedupeKey?: string;
}

export async function notify(db: Db, userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({ userId, ...n })),
    skipDuplicates: true,
  });
}

/** Active users holding the given permission (optionally restricted to a role). */
export async function usersWithPermission(db: Db, permission: string, roleId?: string) {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      roles: {
        some: {
          ...(roleId ? { roleId } : {}),
          role: { permissions: { some: { permission: { code: permission } } } },
        },
      },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
