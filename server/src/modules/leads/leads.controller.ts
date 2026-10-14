import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './leads.service';

export async function listLeads(req: Request, res: Response) {
  res.json(await svc.listLeads(getActor(req), svc.listLeadsQuery.parse(req.query)));
}

export async function getLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getLead(getActor(req), id) });
}

export async function createLead(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createLead(getActor(req), svc.createLeadSchema.parse(req.body)) });
}

export async function updateLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateLead(getActor(req), id, svc.updateLeadSchema.parse(req.body)) });
}

export async function convertLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.convertLead(getActor(req), id, svc.convertLeadSchema.parse(req.body)) });
}
