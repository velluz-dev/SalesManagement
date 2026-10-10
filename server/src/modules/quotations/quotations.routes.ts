import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './quotations.service';
import {
  commentSchema,
  createQuotationSchema,
  customerResponseSchema,
  listQuotationsQuery,
  updateQuotationSchema,
} from './quotations.schemas';

export const quotationsRouter = Router();
const canRead = requireAnyPermission('quotation.read.own', 'quotation.read.team', 'quotation.read.all');

quotationsRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listQuotations(getActor(req), listQuotationsQuery.parse(req.query)));
});

quotationsRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getQuotation(getActor(req), id) });
});

quotationsRouter.post('/', requirePermission('quotation.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createQuotation(getActor(req), createQuotationSchema.parse(req.body)) });
});

quotationsRouter.patch('/:id', requirePermission('quotation.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateQuotation(getActor(req), id, updateQuotationSchema.parse(req.body)) });
});

quotationsRouter.post('/:id/submit', requirePermission('quotation.submit'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.json({ data: await svc.submitQuotation(getActor(req), id, comment) });
});

quotationsRouter.post('/:id/withdraw', requirePermission('quotation.submit'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.json({ data: await svc.withdrawQuotation(getActor(req), id, comment) });
});

quotationsRouter.post('/:id/send', requirePermission('quotation.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.markSent(getActor(req), id) });
});

quotationsRouter.post('/:id/customer-response', requirePermission('quotation.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { outcome } = customerResponseSchema.parse(req.body);
  res.json({ data: await svc.recordCustomerResponse(getActor(req), id, outcome) });
});

quotationsRouter.post('/:id/cancel', requirePermission('quotation.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.cancelQuotation(getActor(req), id) });
});

quotationsRouter.post('/:id/revise', requirePermission('quotation.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { comment } = commentSchema.parse(req.body ?? {});
  res.status(201).json({ data: await svc.reviseQuotation(getActor(req), id, comment) });
});
