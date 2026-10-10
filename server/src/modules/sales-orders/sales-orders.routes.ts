import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './sales-orders.service';

export const salesOrdersRouter = Router();
const canRead = requireAnyPermission('order.read.own', 'order.read.team', 'order.read.all');

salesOrdersRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listOrders(getActor(req), svc.listOrdersQuery.parse(req.query)));
});

salesOrdersRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getOrder(getActor(req), id) });
});

salesOrdersRouter.post('/', requirePermission('order.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createOrder(getActor(req), svc.createOrderSchema.parse(req.body)) });
});

salesOrdersRouter.patch('/:id', requirePermission('order.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateOrder(getActor(req), id, svc.updateOrderSchema.parse(req.body)) });
});

salesOrdersRouter.post('/:id/confirm', requirePermission('order.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.confirmOrder(getActor(req), id) });
});

salesOrdersRouter.post('/:id/deliver', requirePermission('order.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { deliveryDate } = svc.deliverOrderSchema.parse(req.body ?? {});
  res.json({ data: await svc.deliverOrder(getActor(req), id, deliveryDate) });
});

salesOrdersRouter.post('/:id/cancel', requirePermission('order.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { reason } = svc.cancelOrderSchema.parse(req.body);
  res.json({ data: await svc.cancelOrder(getActor(req), id, reason) });
});
