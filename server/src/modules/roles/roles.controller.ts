import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './roles.service';

export async function listRoles(_req: Request, res: Response) {
  res.json({ data: await svc.listRoles() });
}

export async function listPermissions(_req: Request, res: Response) {
  res.json({ data: svc.listPermissionGroups() });
}

export async function createRole(req: Request, res: Response) {
  const actor = getActor(req);
  const input = svc.createRoleSchema.parse(req.body);
  res.status(201).json({ data: await svc.createRole(actor, input) });
}

export async function updateRole(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = svc.updateRoleSchema.parse(req.body);
  res.json({ data: await svc.updateRole(actor, id, input) });
}

export async function deleteRole(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.deleteRole(actor, id);
  res.status(204).end();
}
