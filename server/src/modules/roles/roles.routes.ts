import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { sensitiveLimiter } from '../../middleware/security';
import * as controller from './roles.controller';

export const rolesRouter = Router();

rolesRouter.get('/', requirePermission('role.read'), controller.listRoles);
rolesRouter.get('/permissions', requirePermission('role.read'), controller.listPermissions);
rolesRouter.post('/', requirePermission('role.manage'), controller.createRole);
rolesRouter.patch('/:id', requirePermission('role.manage'), sensitiveLimiter, controller.updateRole);
rolesRouter.delete('/:id', requirePermission('role.manage'), controller.deleteRole);
