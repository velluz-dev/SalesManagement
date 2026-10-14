import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './customers.controller';

export const customersRouter = Router();
const canRead = requireAnyPermission('customer.read.own', 'customer.read.team', 'customer.read.all');

customersRouter.get('/', canRead, controller.listCustomers);
customersRouter.get('/:id', canRead, controller.getCustomer);
customersRouter.post('/', requirePermission('customer.create'), controller.createCustomer);
customersRouter.patch('/:id', requirePermission('customer.update'), controller.updateCustomer);
