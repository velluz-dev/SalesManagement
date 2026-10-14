import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './reports.controller';

export const reportsRouter = Router();

reportsRouter.get('/sales', requireAnyPermission('report.sales.own', 'report.sales.team', 'report.sales.all'), controller.salesReport);
reportsRouter.get('/finance', requirePermission('report.finance'), controller.financeReport);
