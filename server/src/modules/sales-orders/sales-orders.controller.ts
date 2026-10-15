import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './sales-orders.service';
import {
  cancelOrderSchema,
  createOrderSchema,
  deliverOrderSchema,
  listOrdersQuery,
  updateOrderSchema,
} from './sales-orders.validation';

export async function listOrders(req: Request, res: Response) {
  res.json(await svc.listOrders(getActor(req), listOrdersQuery.parse(req.query)));
}

export async function getOrder(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getOrder(getActor(req), id) });
}

export async function createOrder(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createOrder(getActor(req), createOrderSchema.parse(req.body)) });
}

export async function updateOrder(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateOrder(getActor(req), id, updateOrderSchema.parse(req.body)) });
}

export async function confirmOrder(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.confirmOrder(getActor(req), id) });
}

export async function deliverOrder(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { deliveryDate } = deliverOrderSchema.parse(req.body ?? {});
  res.json({ data: await svc.deliverOrder(getActor(req), id, deliveryDate) });
}

export async function cancelOrder(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { reason } = cancelOrderSchema.parse(req.body);
  res.json({ data: await svc.cancelOrder(getActor(req), id, reason) });
}
