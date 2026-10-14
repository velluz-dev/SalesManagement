import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './contracts.service';

export async function listContracts(req: Request, res: Response) {
  res.json(await svc.listContracts(getActor(req), svc.listContractsQuery.parse(req.query)));
}

export async function getContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getContract(getActor(req), id) });
}

export async function createContract(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createContract(getActor(req), svc.createContractSchema.parse(req.body)) });
}

export async function updateContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateContract(getActor(req), id, svc.updateContractSchema.parse(req.body)) });
}

export async function completeContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.completeContract(getActor(req), id) });
}

export async function cancelContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { reason } = svc.cancelContractSchema.parse(req.body);
  res.json({ data: await svc.cancelContract(getActor(req), id, reason) });
}
