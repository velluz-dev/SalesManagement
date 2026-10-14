import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './targets.controller';

export const targetsRouter = Router();

targetsRouter.get('/', requireAnyPermission('target.read.own', 'target.read.team', 'target.read.all'), controller.listTargets);
targetsRouter.post('/', requirePermission('target.manage'), controller.createTarget);
targetsRouter.put('/:id', requirePermission('target.manage'), controller.updateTarget);
targetsRouter.delete('/:id', requirePermission('target.manage'), controller.deleteTarget);
