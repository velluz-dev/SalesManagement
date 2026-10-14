import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './contracts.controller';

export const contractsRouter = Router();
const canRead = requireAnyPermission('contract.read.own', 'contract.read.team', 'contract.read.all');

contractsRouter.get('/', canRead, controller.listContracts);
contractsRouter.get('/:id', canRead, controller.getContract);
contractsRouter.post('/', requirePermission('contract.manage'), controller.createContract);
contractsRouter.patch('/:id', requirePermission('contract.manage'), controller.updateContract);
contractsRouter.post('/:id/complete', requirePermission('contract.manage'), controller.completeContract);
contractsRouter.post('/:id/cancel', requirePermission('contract.manage'), controller.cancelContract);
