import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './leads.controller';

export const leadsRouter = Router();
const canRead = requireAnyPermission('lead.read.own', 'lead.read.team', 'lead.read.all');

leadsRouter.get('/', canRead, controller.listLeads);
leadsRouter.get('/:id', canRead, controller.getLead);
leadsRouter.post('/', requirePermission('lead.create'), controller.createLead);
leadsRouter.patch('/:id', requirePermission('lead.update'), controller.updateLead);
leadsRouter.post('/:id/convert', requirePermission('lead.convert'), controller.convertLead);
