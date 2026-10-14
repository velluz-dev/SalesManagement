import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './products.service';

export async function listProducts(req: Request, res: Response) {
  const actor = getActor(req);
  const q = svc.listProductsQuery.parse(req.query);
  res.json(await svc.listProducts(actor, q));
}

export async function listCategories(_req: Request, res: Response) {
  res.json({ data: await svc.listCategories() });
}

export async function getProduct(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getProduct(id) });
}

export async function createProduct(req: Request, res: Response) {
  const actor = getActor(req);
  const input = svc.productSchema.parse(req.body);
  res.status(201).json({ data: await svc.createProduct(actor, input) });
}

export async function updateProduct(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = svc.updateProductSchema.parse(req.body);
  res.json({ data: await svc.updateProduct(actor, id, input) });
}
