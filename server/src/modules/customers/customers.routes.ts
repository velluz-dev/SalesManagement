import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './customers.service';

export const customersRouter = Router();
const canRead = requireAnyPermission('customer.read.own', 'customer.read.team', 'customer.read.all');

customersRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listCustomers(getActor(req), svc.listCustomersQuery.parse(req.query)));
});

customersRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getCustomer(getActor(req), id) });
});

customersRouter.post('/', requirePermission('customer.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createCustomer(getActor(req), svc.createCustomerSchema.parse(req.body)) });
});

customersRouter.patch('/:id', requirePermission('customer.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateCustomer(getActor(req), id, svc.updateCustomerSchema.parse(req.body)) });
});
