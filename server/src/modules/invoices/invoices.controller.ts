import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './invoices.service';

export async function listInvoices(req: Request, res: Response) {
  res.json(await svc.listInvoices(svc.listInvoicesQuery.parse(req.query)));
}

export async function getInvoice(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getInvoice(id) });
}

export async function createInvoice(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createInvoice(getActor(req), svc.createInvoiceSchema.parse(req.body)) });
}

export async function updateInvoice(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateInvoice(getActor(req), id, svc.updateInvoiceSchema.parse(req.body)) });
}

export async function issueInvoice(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.issueInvoice(getActor(req), id, svc.issueInvoiceSchema.parse(req.body ?? {})) });
}

export async function cancelInvoice(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { reason } = svc.cancelInvoiceSchema.parse(req.body);
  res.json({ data: await svc.cancelInvoice(getActor(req), id, reason) });
}
