import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './notifications.service';
import { listNotificationsQuery, readAllSchema } from './notifications.validation';

export async function listNotifications(req: Request, res: Response) {
  res.json(await svc.listNotifications(getActor(req), listNotificationsQuery.parse(req.query)));
}

export async function unreadCount(req: Request, res: Response) {
  res.json({ data: { count: await svc.unreadCount(getActor(req)) } });
}

export async function markRead(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.markRead(actor, id);
  res.status(204).end();
}

export async function markAllRead(req: Request, res: Response) {
  const actor = getActor(req);
  readAllSchema.parse(req.body ?? {});
  await svc.markAllRead(actor);
  res.status(204).end();
}
