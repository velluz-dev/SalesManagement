import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import * as svc from './settings.service';

export async function getPublicSettings(_req: Request, res: Response) {
  res.json({ data: await svc.getPublicSettings() });
}

export async function getSettings(_req: Request, res: Response) {
  res.json({ data: await svc.getAllSettings() });
}

export async function updateSettings(req: Request, res: Response) {
  const actor = getActor(req);
  const body = svc.updateSettingsSchema.parse(req.body);
  res.json({ data: await svc.updateSettings(actor, body) });
}
