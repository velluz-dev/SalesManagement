import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './contracts.service';
import { cancelContractSchema, createContractSchema, listContractsQuery, updateContractSchema } from './contracts.validation';

export async function listContracts(req: Request, res: Response) {
  res.json(await svc.listContracts(getActor(req), listContractsQuery.parse(req.query)));
}

export async function getContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getContract(getActor(req), id) });
}

export async function createContract(req: Request, res: Response) {
  res.status(201).json({ data: await svc.createContract(getActor(req), createContractSchema.parse(req.body)) });
}

export async function updateContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateContract(getActor(req), id, updateContractSchema.parse(req.body)) });
}

export async function completeContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.completeContract(getActor(req), id) });
}

export async function cancelContract(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  const { reason } = cancelContractSchema.parse(req.body);
  res.json({ data: await svc.cancelContract(getActor(req), id, reason) });
}
