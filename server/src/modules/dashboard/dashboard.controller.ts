import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import * as svc from './dashboard.service';

export async function getDashboard(req: Request, res: Response) {
  res.json({ data: await svc.getDashboard(getActor(req)) });
}
