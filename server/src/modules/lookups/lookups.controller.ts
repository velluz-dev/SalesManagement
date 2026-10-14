import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import * as svc from './lookups.service';

export async function lookupUsers(req: Request, res: Response) {
  res.json({ data: await svc.lookupUsers(getActor(req), svc.searchQuery.parse(req.query)) });
}

export async function lookupCustomers(req: Request, res: Response) {
  res.json({ data: await svc.lookupCustomers(getActor(req), svc.searchQuery.parse(req.query)) });
}

export async function lookupOpportunities(req: Request, res: Response) {
  res.json({ data: await svc.lookupOpportunities(getActor(req), svc.searchQuery.parse(req.query)) });
}

export async function lookupTeams(req: Request, res: Response) {
  res.json({ data: await svc.lookupTeams(getActor(req)) });
}
