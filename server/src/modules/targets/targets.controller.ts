import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './targets.service';

export async function listTargets(req: Request, res: Response) {
  res.json(await svc.listTargets(getActor(req), svc.listTargetsQuery.parse(req.query)));
}

export async function createTarget(req: Request, res: Response) {
  res.status(201).json({ data: await svc.upsertTarget(getActor(req), svc.targetSchema.parse(req.body)) });
}

export async function updateTarget(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.upsertTarget(getActor(req), svc.targetSchema.parse(req.body), id) });
}

export async function deleteTarget(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  await svc.deleteTarget(getActor(req), id);
  res.status(204).end();
}
