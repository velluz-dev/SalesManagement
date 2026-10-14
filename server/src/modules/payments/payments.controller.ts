import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './payments.service';

export async function listPayments(req: Request, res: Response) {
  res.json(await svc.listPayments(svc.listPaymentsQuery.parse(req.query)));
}

export async function recordPayment(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json({ data: await svc.recordPayment(actor, svc.createPaymentSchema.parse(req.body)) });
}

export async function voidPayment(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const { reason } = svc.voidPaymentSchema.parse(req.body);
  res.json({ data: await svc.voidPayment(actor, id, reason) });
}
