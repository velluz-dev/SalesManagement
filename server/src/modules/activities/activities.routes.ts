import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './activities.controller';

export const activitiesRouter = Router();
const canRead = requireAnyPermission('activity.read.own', 'activity.read.team', 'activity.read.all');

activitiesRouter.get('/', canRead, controller.listActivities);
activitiesRouter.post('/', requirePermission('activity.manage'), controller.createActivity);
activitiesRouter.patch('/:id', requirePermission('activity.manage'), controller.updateActivity);
activitiesRouter.delete('/:id', requirePermission('activity.manage'), controller.deleteActivity);
