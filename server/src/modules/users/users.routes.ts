import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { sensitiveLimiter } from '../../middleware/security';
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

export const usersRouter = Router();

usersRouter.get('/', requirePermission('user.read'), async (req, res) => {
  res.json(await svc.listUsers(listUsersQuery.parse(req.query)));
});

usersRouter.get('/:id', requirePermission('user.read'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getUser(id) });
});

usersRouter.post('/', requirePermission('user.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createUser(getActor(req), createUserSchema.parse(req.body)) });
});

usersRouter.patch('/:id', requirePermission('user.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateUser(getActor(req), id, updateUserSchema.parse(req.body)) });
});

usersRouter.put('/:id/roles', requirePermission('role.assign'), sensitiveLimiter, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { roleIds } = setRolesSchema.parse(req.body);
  res.json({ data: await svc.setUserRoles(getActor(req), id, roleIds) });
});

usersRouter.patch('/:id/status', requirePermission('user.deactivate'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { isActive } = setStatusSchema.parse(req.body);
  res.json({ data: await svc.setUserActive(getActor(req), id, isActive) });
});

usersRouter.post('/:id/reset-password', requirePermission('user.update'), sensitiveLimiter, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { password } = resetPasswordSchema.parse(req.body);
  await svc.resetUserPassword(getActor(req), id, password);
  res.status(204).end();
});
