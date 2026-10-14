import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './payment-terms.service';

export async function listPaymentTerms(req: Request, res: Response) {
  const actor = getActor(req);
  const q = svc.listPaymentTermsQuery.parse(req.query);
  res.json({ data: await svc.listPaymentTerms(actor, q) });
}

export async function createPaymentTerm(req: Request, res: Response) {
  const actor = getActor(req);
  const input = svc.termSchema.parse(req.body);
  res.status(201).json({ data: await svc.createPaymentTerm(actor, input) });
}

export async function updatePaymentTerm(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = svc.updateTermSchema.parse(req.body);
  res.json({ data: await svc.updatePaymentTerm(actor, id, input) });
}

export async function deletePaymentTerm(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.deletePaymentTerm(actor, id);
  res.status(204).end();
}
