import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { uuid } from '../../lib/validation';
import * as svc from './credit.service';

export async function listCredit(req: Request, res: Response) {
  const actor = getActor(req);
  res.json(await svc.listCredit(actor, svc.listCreditQuery.parse(req.query)));
}

export async function getCredit(req: Request, res: Response) {
  const actor = getActor(req);
  const customerId = uuid.parse(req.params.customerId);
  res.json({ data: await svc.getCredit(actor, customerId) });
}

export async function updateCredit(req: Request, res: Response) {
  const actor = getActor(req);
  const customerId = uuid.parse(req.params.customerId);
  res.json({ data: await svc.updateCredit(actor, customerId, svc.creditSchema.parse(req.body)) });
}
