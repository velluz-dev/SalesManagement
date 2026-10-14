import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './customers.service';

export async function listCustomers(req: Request, res: Response) {
  res.json(await svc.listCustomers(getActor(req), svc.listCustomersQuery.parse(req.query)));
}

export async function getCustomer(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getCustomer(getActor(req), id) });
}

export async function createCustomer(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createCustomer(getActor(req), svc.createCustomerSchema.parse(req.body)) });
}

export async function updateCustomer(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateCustomer(getActor(req), id, svc.updateCustomerSchema.parse(req.body)) });
}
