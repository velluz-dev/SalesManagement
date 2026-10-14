import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './invoices.controller';

export const invoicesRouter = Router();

invoicesRouter.get('/', requirePermission('invoice.read'), controller.listInvoices);
invoicesRouter.get('/:id', requirePermission('invoice.read'), controller.getInvoice);
invoicesRouter.post('/', requirePermission('invoice.create'), controller.createInvoice);
invoicesRouter.patch('/:id', requirePermission('invoice.update'), controller.updateInvoice);
invoicesRouter.post('/:id/issue', requirePermission('invoice.update'), controller.issueInvoice);
invoicesRouter.post('/:id/cancel', requirePermission('invoice.cancel'), controller.cancelInvoice);
