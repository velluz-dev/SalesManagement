import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './targets.service';

export const targetsRouter = Router();

targetsRouter.get('/', requireAnyPermission('target.read.own', 'target.read.team', 'target.read.all'), async (req, res) => {
  res.json(await svc.listTargets(getActor(req), svc.listTargetsQuery.parse(req.query)));
});

targetsRouter.post('/', requirePermission('target.manage'), async (req, res) => {
  res.status(201).json({ data: await svc.upsertTarget(getActor(req), svc.targetSchema.parse(req.body)) });
});

targetsRouter.put('/:id', requirePermission('target.manage'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.upsertTarget(getActor(req), svc.targetSchema.parse(req.body), id) });
});

targetsRouter.delete('/:id', requirePermission('target.manage'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  await svc.deleteTarget(getActor(req), id);
  res.status(204).end();
});
