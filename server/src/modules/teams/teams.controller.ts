import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './teams.service';

export async function listTeams(_req: Request, res: Response) {
  res.json({ data: await svc.listTeams() });
}

export async function getTeam(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getTeam(id) });
}

export async function createTeam(req: Request, res: Response) {
  const actor = getActor(req);
  const input = svc.teamSchema.parse(req.body);
  res.status(201).json({ data: await svc.createTeam(actor, input) });
}

export async function updateTeam(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = svc.updateTeamSchema.parse(req.body);
  res.json({ data: await svc.updateTeam(actor, id, input) });
}

export async function deleteTeam(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.deleteTeam(actor, id);
  res.status(204).end();
}
