import { Router } from 'express';
import { requireAnyPermission } from '../../middleware/auth';
import * as controller from './lookups.controller';

export const lookupsRouter = Router();

lookupsRouter.get('/users', controller.lookupUsers);
lookupsRouter.get('/customers', requireAnyPermission('customer.read.own', 'customer.read.team', 'customer.read.all'), controller.lookupCustomers);
lookupsRouter.get('/opportunities', requireAnyPermission('opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'), controller.lookupOpportunities);
lookupsRouter.get('/teams', controller.lookupTeams);
