import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './users.service';
import {
  createUserSchema,
  listUsersQuery,
  resetPasswordSchema,
  setRolesSchema,
  setStatusSchema,
  updateUserSchema,
} from './users.schemas';

export async function listUsers(req: Request, res: Response) {
  res.json(await svc.listUsers(listUsersQuery.parse(req.query)));
}

export async function getUser(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getUser(id) });
}

export async function createUser(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createUser(getActor(req), createUserSchema.parse(req.body)) });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateUser(getActor(req), id, updateUserSchema.parse(req.body)) });
}

export async function setUserRoles(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { roleIds } = setRolesSchema.parse(req.body);
  res.json({ data: await svc.setUserRoles(getActor(req), id, roleIds) });
}

export async function setUserStatus(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { isActive } = setStatusSchema.parse(req.body);
  res.json({ data: await svc.setUserActive(getActor(req), id, isActive) });
}

export async function resetUserPassword(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { password } = resetPasswordSchema.parse(req.body);
  await svc.resetUserPassword(getActor(req), id, password);
  res.status(204).end();
}
