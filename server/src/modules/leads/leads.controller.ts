import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './leads.service';
import { convertLeadSchema, createLeadSchema, listLeadsQuery, updateLeadSchema } from './leads.validation';

export async function listLeads(req: Request, res: Response) {
  res.json(await svc.listLeads(getActor(req), listLeadsQuery.parse(req.query)));
}

export async function getLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getLead(getActor(req), id) });
}

export async function createLead(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createLead(getActor(req), createLeadSchema.parse(req.body)) });
}

export async function updateLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateLead(getActor(req), id, updateLeadSchema.parse(req.body)) });
}

export async function convertLead(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.convertLead(getActor(req), id, convertLeadSchema.parse(req.body)) });
}
