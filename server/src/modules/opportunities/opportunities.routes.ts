import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './opportunities.controller';

export const opportunitiesRouter = Router();
const canRead = requireAnyPermission('opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all');

opportunitiesRouter.get('/', canRead, controller.listOpportunities);
opportunitiesRouter.get('/pipeline', canRead, controller.pipeline);
opportunitiesRouter.get('/:id', canRead, controller.getOpportunity);
opportunitiesRouter.post('/', requirePermission('opportunity.create'), controller.createOpportunity);
opportunitiesRouter.patch('/:id', requirePermission('opportunity.update'), controller.updateOpportunity);
