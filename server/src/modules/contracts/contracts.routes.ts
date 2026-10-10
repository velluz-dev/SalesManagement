import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './contracts.service';

export const contractsRouter = Router();
const canRead = requireAnyPermission('contract.read.own', 'contract.read.team', 'contract.read.all');

contractsRouter.get('/', canRead, async (req, res) => {
  res.json(await svc.listContracts(getActor(req), svc.listContractsQuery.parse(req.query)));
});

contractsRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getContract(getActor(req), id) });
});

contractsRouter.post('/', requirePermission('contract.manage'), async (req, res) => {
  res.status(201).json({ data: await svc.createContract(getActor(req), svc.createContractSchema.parse(req.body)) });
});

contractsRouter.patch('/:id', requirePermission('contract.manage'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateContract(getActor(req), id, svc.updateContractSchema.parse(req.body)) });
});

contractsRouter.post('/:id/complete', requirePermission('contract.manage'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.completeContract(getActor(req), id) });
});

contractsRouter.post('/:id/cancel', requirePermission('contract.manage'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { reason } = svc.cancelContractSchema.parse(req.body);
  res.json({ data: await svc.cancelContract(getActor(req), id, reason) });
});
