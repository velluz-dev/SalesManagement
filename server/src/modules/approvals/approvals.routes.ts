import { Router } from 'express';
import { z } from 'zod';
import { APPROVER_TYPES } from '../../shared';
import { prisma } from '../../lib/prisma';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { idParams, money, requiredText, uuid } from '../../lib/validation';
import * as svc from './approvals.service';

export const approvalsRouter = Router();

approvalsRouter.get('/', requireAnyPermission('approval.read.assigned', 'approval.read.all'), async (req, res) => {
  res.json(await svc.listApprovals(getActor(req), svc.listApprovalsQuery.parse(req.query)));
});

approvalsRouter.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.getApproval(getActor(req), id) });
});

approvalsRouter.post('/:id/decision', requirePermission('approval.decide'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await svc.decide(getActor(req), id, svc.decisionSchema.parse(req.body)) });
});

export const approvalRulesRouter = Router();

const ruleSchema = z
  .strictObject({
    name: requiredText(120, 'Name'),
    minAmount: money,
    maxAmount: money.nullable().optional(),
    approverType: z.enum(APPROVER_TYPES),
    approverRoleId: uuid,
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((r) => r.maxAmount == null || Number(r.maxAmount) > Number(r.minAmount), {
    message: 'Maximum must be greater than minimum',
    path: ['maxAmount'],
  });

async function assertApproverRole(roleId: string) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, permissions: { some: { permission: { code: 'approval.decide' } } } },
  });
  if (!role) throw badRequest('The approver role must hold the approval.decide permission');
}

const ruleInclude = { approverRole: { select: { id: true, code: true, name: true } } } as const;

approvalRulesRouter.get('/', requireAnyPermission('settings.read', 'approval.read.all'), async (_req, res) => {
  res.json({ data: await prisma.approvalRule.findMany({ include: ruleInclude, orderBy: [{ minAmount: 'asc' }, { priority: 'desc' }] }) });
});

approvalRulesRouter.post('/', requirePermission('settings.manage'), async (req, res) => {
  const actor = getActor(req);
  const input = ruleSchema.parse(req.body);
  await assertApproverRole(input.approverRoleId);
  const rule = await prisma.$transaction(async (tx) => {
    const r = await tx.approvalRule.create({ data: { ...input, maxAmount: input.maxAmount ?? null }, include: ruleInclude });
    await audit(tx, actor, { action: 'approval_rule.created', entityType: 'ApprovalRule', entityId: r.id, after: r });
    return r;
  });
  res.status(201).json({ data: rule });
});

approvalRulesRouter.put('/:id', requirePermission('settings.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = ruleSchema.parse(req.body);
  await assertApproverRole(input.approverRoleId);
  const rule = await prisma.$transaction(async (tx) => {
    const before = await tx.approvalRule.findUnique({ where: { id } });
    if (!before) throw notFound('Approval rule');
    const r = await tx.approvalRule.update({ where: { id }, data: { ...input, maxAmount: input.maxAmount ?? null }, include: ruleInclude });
    await audit(tx, actor, { action: 'approval_rule.updated', entityType: 'ApprovalRule', entityId: id, before, after: r });
    return r;
  });
  res.json({ data: rule });
});

approvalRulesRouter.delete('/:id', requirePermission('settings.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await prisma.$transaction(async (tx) => {
    const before = await tx.approvalRule.findUnique({ where: { id } });
    if (!before) throw notFound('Approval rule');
    await tx.approvalRule.delete({ where: { id } });
    await audit(tx, actor, { action: 'approval_rule.deleted', entityType: 'ApprovalRule', entityId: id, before });
  });
  res.status(204).end();
});
