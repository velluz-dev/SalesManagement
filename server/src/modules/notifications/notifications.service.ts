import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { notFound } from '../../lib/errors';
import { pageArgs, paged } from '../../lib/pagination';
import { listNotificationsQuery } from './notifications.validation';

export async function listNotifications(actor: Actor, q: z.infer<typeof listNotificationsQuery>) {
  const where = { userId: actor.user.id, ...(q.unread ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.user.id, readAt: null } }),
  ]);
  return { ...paged(rows, total, q), unread };
}

export async function unreadCount(actor: Actor) {
  return prisma.notification.count({ where: { userId: actor.user.id, readAt: null } });
}

export async function markRead(actor: Actor, id: string) {
  const r = await prisma.notification.updateMany({ where: { id, userId: actor.user.id, readAt: null }, data: { readAt: new Date() } });
  if (!r.count && !(await prisma.notification.findFirst({ where: { id, userId: actor.user.id } }))) throw notFound('Notification');
}

export async function markAllRead(actor: Actor) {
  await prisma.notification.updateMany({ where: { userId: actor.user.id, readAt: null }, data: { readAt: new Date() } });
}
