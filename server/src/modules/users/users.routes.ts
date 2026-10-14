import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { sensitiveLimiter } from '../../middleware/security';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', requirePermission('user.read'), controller.listUsers);
usersRouter.get('/:id', requirePermission('user.read'), controller.getUser);
usersRouter.post('/', requirePermission('user.create'), controller.createUser);
usersRouter.patch('/:id', requirePermission('user.update'), controller.updateUser);
usersRouter.put('/:id/roles', requirePermission('role.assign'), sensitiveLimiter, controller.setUserRoles);
usersRouter.patch('/:id/status', requirePermission('user.deactivate'), controller.setUserStatus);
usersRouter.post('/:id/reset-password', requirePermission('user.update'), sensitiveLimiter, controller.resetUserPassword);
