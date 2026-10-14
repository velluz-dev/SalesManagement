import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './credit.controller';

export const creditRouter = Router();

creditRouter.get('/', requirePermission('credit.read'), controller.listCredit);
creditRouter.get('/:customerId', requirePermission('credit.read'), controller.getCredit);
creditRouter.put('/:customerId', requirePermission('credit.manage'), controller.updateCredit);
