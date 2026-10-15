import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './activities.service';
import { createActivitySchema, listActivitiesQuery, updateActivitySchema } from './activities.validation';

export async function listActivities(req: Request, res: Response) {
  res.json(await svc.listActivities(getActor(req), listActivitiesQuery.parse(req.query)));
}

export async function createActivity(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json({ data: await svc.createActivity(actor, createActivitySchema.parse(req.body)) });
}

export async function updateActivity(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateActivity(actor, id, updateActivitySchema.parse(req.body)) });
}

export async function deleteActivity(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.deleteActivity(actor, id);
  res.status(204).end();
}
