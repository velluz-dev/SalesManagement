import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './audit.controller';

export const auditRouter = Router();

auditRouter.get('/', requirePermission('audit.read'), controller.listAuditLogs);
auditRouter.get('/facets', requirePermission('audit.read'), controller.auditFacets);
