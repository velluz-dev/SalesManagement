import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams, uuid } from '../../lib/validation';
import * as svc from './opportunities.service';

export const opportunitiesRouter = Router();
const canRead = requireAnyPermission('opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all');

opportunitiesRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listOpportunities(getActor(req), svc.listOpportunitiesQuery.parse(req.query)));
});

opportunitiesRouter.get('/pipeline', canRead, async (req, res) => {
  const ownerId = req.query.ownerId ? uuid.parse(req.query.ownerId) : undefined;
  res.json({ data: await svc.pipeline(getActor(req), ownerId) });
});

opportunitiesRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getOpportunity(getActor(req), id) });
});

opportunitiesRouter.post('/', requirePermission('opportunity.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createOpportunity(getActor(req), svc.createOpportunitySchema.parse(req.body)) });
});

opportunitiesRouter.patch('/:id', requirePermission('opportunity.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateOpportunity(getActor(req), id, svc.updateOpportunitySchema.parse(req.body)) });
});
