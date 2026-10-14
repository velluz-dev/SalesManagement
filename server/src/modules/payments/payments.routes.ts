import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './payments.controller';

export const paymentsRouter = Router();

paymentsRouter.get('/', requirePermission('payment.read'), controller.listPayments);
paymentsRouter.post('/', requirePermission('payment.create'), controller.recordPayment);
paymentsRouter.post('/:id/void', requirePermission('payment.void'), controller.voidPayment);
