import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './leads.service';

export const leadsRouter = Router();
const canRead = requireAnyPermission('lead.read.own', 'lead.read.team', 'lead.read.all');

leadsRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listLeads(getActor(req), svc.listLeadsQuery.parse(req.query)));
});

leadsRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getLead(getActor(req), id) });
});

leadsRouter.post('/', requirePermission('lead.create'), async (req, res) => {
  res.status(201).json({ data: await svc.createLead(getActor(req), svc.createLeadSchema.parse(req.body)) });
});

leadsRouter.patch('/:id', requirePermission('lead.update'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateLead(getActor(req), id, svc.updateLeadSchema.parse(req.body)) });
});

leadsRouter.post('/:id/convert', requirePermission('lead.convert'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.convertLead(getActor(req), id, svc.convertLeadSchema.parse(req.body)) });
});
