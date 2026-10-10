import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './invoices.service';

export const invoicesRouter = Router();

invoicesRouter.get('/', requirePermission('invoice.read'), async (req, res) => {
  res.json(await svc.listInvoices(svc.listInvoicesQuery.parse(req.query)));
});

invoicesRouter.get('/:id', requirePermission('invoice.read'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getInvoice(id) });
});

invoicesRouter.post('/', requirePermission('invoice.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createInvoice(getActor(req), svc.createInvoiceSchema.parse(req.body)) });
});

invoicesRouter.patch('/:id', requirePermission('invoice.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateInvoice(getActor(req), id, svc.updateInvoiceSchema.parse(req.body)) });
});

invoicesRouter.post('/:id/issue', requirePermission('invoice.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.issueInvoice(getActor(req), id, svc.issueInvoiceSchema.parse(req.body ?? {})) });
});

invoicesRouter.post('/:id/cancel', requirePermission('invoice.cancel'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { reason } = svc.cancelInvoiceSchema.parse(req.body);
  res.json({ data: await svc.cancelInvoice(getActor(req), id, reason) });
});
