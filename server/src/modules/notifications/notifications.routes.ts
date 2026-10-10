import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getActor } from '../../lib/auth-context';
import { notFound } from '../../lib/errors';
import { pageArgs, paged, paginationQuery } from '../../lib/pagination';
import { booleanQuery, idParams } from '../../lib/validation';

/** Notifications are always restricted to the current user. */
export const notificationsRouter = Router();

const listQuery = paginationQuery.extend({ unread: booleanQuery });

notificationsRouter.get('/', async (req, res) => {
  const actor = getActor(req);
  const q = listQuery.parse(req.query);
  const where = { userId: actor.user.id, ...(q.unread ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.user.id, readAt: null } }),
  ]);
  res.json({ ...paged(rows, total, q), unread });
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const actor = getActor(req);
  res.json({ data: { count: await prisma.notification.count({ where: { userId: actor.user.id, readAt: null } }) } });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const r = await prisma.notification.updateMany({ where: { id, userId: actor.user.id, readAt: null }, data: { readAt: new Date() } });
  if (!r.count && !(await prisma.notification.findFirst({ where: { id, userId: actor.user.id } }))) throw notFound('Notification');
  res.status(204).end();
});

notificationsRouter.post('/read-all', async (req, res) => {
  const actor = getActor(req);
  z.object({}).parse(req.body ?? {});
  await prisma.notification.updateMany({ where: { userId: actor.user.id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});
