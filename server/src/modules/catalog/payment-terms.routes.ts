import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './payment-terms.controller';

export const paymentTermsRouter = Router();

paymentTermsRouter.get('/', controller.listPaymentTerms);
paymentTermsRouter.post('/', requirePermission('credit.manage'), controller.createPaymentTerm);
paymentTermsRouter.patch('/:id', requirePermission('credit.manage'), controller.updatePaymentTerm);
paymentTermsRouter.delete('/:id', requirePermission('credit.manage'), controller.deletePaymentTerm);
