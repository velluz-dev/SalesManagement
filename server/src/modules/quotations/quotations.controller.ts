import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './quotations.service';
import {
  commentSchema,
  createQuotationSchema,
  customerResponseSchema,
  listQuotationsQuery,
  updateQuotationSchema,
} from './quotations.validation';

export async function listQuotations(req: Request, res: Response) {
  res.json(await svc.listQuotations(getActor(req), listQuotationsQuery.parse(req.query)));
}

export async function getQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getQuotation(getActor(req), id) });
}

export async function createQuotation(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createQuotation(getActor(req), createQuotationSchema.parse(req.body)) });
}

export async function updateQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateQuotation(getActor(req), id, updateQuotationSchema.parse(req.body)) });
}

export async function submitQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.json({ data: await svc.submitQuotation(getActor(req), id, comment) });
}

export async function withdrawQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.json({ data: await svc.withdrawQuotation(getActor(req), id, comment) });
}

export async function sendQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.markSent(getActor(req), id) });
}

export async function recordCustomerResponse(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { outcome } = customerResponseSchema.parse(req.body);
  res.json({ data: await svc.recordCustomerResponse(getActor(req), id, outcome) });
}

export async function cancelQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.cancelQuotation(getActor(req), id) });
}

export async function reviseQuotation(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.status(201).json({ data: await svc.reviseQuotation(getActor(req), id, comment) });
}
