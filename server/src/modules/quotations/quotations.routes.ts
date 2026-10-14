import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './quotations.controller';

export const quotationsRouter = Router();
const canRead = requireAnyPermission('quotation.read.own', 'quotation.read.team', 'quotation.read.all');

quotationsRouter.get('/', canRead, controller.listQuotations);
quotationsRouter.get('/:id', canRead, controller.getQuotation);
quotationsRouter.post('/', requirePermission('quotation.create'), controller.createQuotation);
quotationsRouter.patch('/:id', requirePermission('quotation.update'), controller.updateQuotation);
quotationsRouter.post('/:id/submit', requirePermission('quotation.submit'), controller.submitQuotation);
quotationsRouter.post('/:id/withdraw', requirePermission('quotation.submit'), controller.withdrawQuotation);
quotationsRouter.post('/:id/send', requirePermission('quotation.update'), controller.sendQuotation);
quotationsRouter.post('/:id/customer-response', requirePermission('quotation.update'), controller.recordCustomerResponse);
quotationsRouter.post('/:id/cancel', requirePermission('quotation.update'), controller.cancelQuotation);
quotationsRouter.post('/:id/revise', requirePermission('quotation.update'), controller.reviseQuotation);
