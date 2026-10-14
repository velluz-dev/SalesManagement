import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams, uuid } from '../../lib/validation';
import * as svc from './opportunities.service';

export async function listOpportunities(req: Request, res: Response) {
  res.json(await svc.listOpportunities(getActor(req), svc.listOpportunitiesQuery.parse(req.query)));
}

export async function pipeline(req: Request, res: Response) {
  const ownerId = req.query.ownerId ? uuid.parse(req.query.ownerId) : undefined;
  res.json({ data: await svc.pipeline(getActor(req), ownerId) });
}

export async function getOpportunity(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getOpportunity(getActor(req), id) });
}

export async function createOpportunity(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createOpportunity(getActor(req), svc.createOpportunitySchema.parse(req.body)) });
}

export async function updateOpportunity(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateOpportunity(getActor(req), id, svc.updateOpportunitySchema.parse(req.body)) });
}
