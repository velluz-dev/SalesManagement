import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import { idParams } from '../../lib/validation';
import * as svc from './approvals.service';
import { decisionSchema, listApprovalsQuery, ruleSchema } from './approvals.validation';

export async function listApprovals(req: Request, res: Response) {
  res.json(await svc.listApprovals(getActor(req), listApprovalsQuery.parse(req.query)));
}

export async function getApproval(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getApproval(getActor(req), id) });
}

export async function decide(req: Request, res: Response) {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.decide(getActor(req), id, decisionSchema.parse(req.body)) });
}

export async function listApprovalRules(_req: Request, res: Response) {
  res.json({ data: await svc.listApprovalRules() });
}

export async function createApprovalRule(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json({ data: await svc.createApprovalRule(actor, ruleSchema.parse(req.body)) });
}

export async function updateApprovalRule(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.updateApprovalRule(actor, id, ruleSchema.parse(req.body)) });
}

export async function deleteApprovalRule(req: Request, res: Response) {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await svc.deleteApprovalRule(actor, id);
  res.status(204).end();
}
