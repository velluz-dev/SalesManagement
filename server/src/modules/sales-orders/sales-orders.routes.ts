import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './sales-orders.controller';

export const salesOrdersRouter = Router();
const canRead = requireAnyPermission('order.read.own', 'order.read.team', 'order.read.all');

salesOrdersRouter.get('/', canRead, controller.listOrders);
salesOrdersRouter.get('/:id', canRead, controller.getOrder);
salesOrdersRouter.post('/', requirePermission('order.create'), controller.createOrder);
salesOrdersRouter.patch('/:id', requirePermission('order.update'), controller.updateOrder);
salesOrdersRouter.post('/:id/confirm', requirePermission('order.update'), controller.confirmOrder);
salesOrdersRouter.post('/:id/deliver', requirePermission('order.update'), controller.deliverOrder);
salesOrdersRouter.post('/:id/cancel', requirePermission('order.update'), controller.cancelOrder);
