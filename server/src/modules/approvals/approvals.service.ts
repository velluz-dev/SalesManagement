import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { contains, pageArgs, paged } from '../../lib/pagination';
import { getSetting } from '../../lib/settings';
import { ownerSelect } from '../../lib/ownership';
import { isSelfApproval } from './approval-engine';
import { decisionSchema, listApprovalsQuery, ruleSchema } from './approvals.validation';

function assignedWhere(actor: Actor): Prisma.ApprovalRequestWhereInput {
  return {
    OR: [
      { assignedToId: actor.user.id },
      { assignedToId: null, approverRole: { code: { in: actor.roles } } },
    ],
  };
}

const include = {
  quotation: {
    select: {
      id: true, number: true, version: true, status: true, total: true, currency: true, ownerId: true,
      customer: { select: { id: true, name: true } }, owner: ownerSelect,
    },
  },
  requestedBy: ownerSelect,
  assignedTo: ownerSelect,
  decidedBy: ownerSelect,
  approverRole: { select: { id: true, code: true, name: true } },
  rule: { select: { id: true, name: true, minAmount: true, maxAmount: true } },
  history: { orderBy: { createdAt: 'asc' }, include: { actor: ownerSelect } },
} satisfies Prisma.ApprovalRequestInclude;

type RequestRow = Prisma.ApprovalRequestGetPayload<{ include: typeof include }>;

export function decisionBlocker(actor: Actor, r: Pick<RequestRow, 'status' | 'assignedToId' | 'requestedById' | 'approverRole'> & { quotation: { ownerId: string; status: string } }, allowSelf: boolean): string | null {
  if (!actor.permissions.has('approval.decide')) return 'You do not have approval authority';
  if (r.status !== 'PENDING') return 'This request has already been decided';
  if (r.quotation.status !== 'PENDING_APPROVAL') return 'The quotation is no longer pending approval';
  if (r.assignedToId ? r.assignedToId !== actor.user.id : !actor.roles.includes(r.approverRole.code)) {
    return 'This request is not assigned to you';
  }
  if (!allowSelf && isSelfApproval(actor.user.id, r.requestedById, r.quotation.ownerId)) {
    return 'You cannot approve your own quotation';
  }
  return null;
}

export async function listApprovals(actor: Actor, q: z.infer<typeof listApprovalsQuery>) {
  if (q.view === 'all' && !actor.permissions.has('approval.read.all')) throw forbidden();
  if (q.view === 'assigned' && !actor.permissions.has('approval.read.assigned')) throw forbidden();
  const where: Prisma.ApprovalRequestWhereInput = {
    AND: [
      q.view === 'assigned' ? assignedWhere(actor) : {},
      q.status ? { status: q.status } : {},
      q.q ? { OR: [{ quotation: { number: contains(q.q) } }, { quotation: { customer: { name: contains(q.q) } } }] } : {},
    ],
  };
  const allowSelf = await getSetting(prisma, 'approval.allowSelfApproval');
  const [rows, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, include, orderBy: { [q.sort]: q.order }, ...pageArgs(q) }),
    prisma.approvalRequest.count({ where }),
  ]);
  return paged(rows.map((r) => ({ ...r, canDecide: decisionBlocker(actor, r, allowSelf) === null })), total, q);
}

export async function getApproval(actor: Actor, id: string) {
  const r = await prisma.approvalRequest.findUnique({ where: { id }, include });
  if (!r) throw notFound('Approval request');
  const canSeeAll = actor.permissions.has('approval.read.all');
  const isAssigned = r.assignedToId === actor.user.id || (!r.assignedToId && actor.roles.includes(r.approverRole.code));
  const isRequester = r.requestedById === actor.user.id || r.quotation.ownerId === actor.user.id;
  if (!canSeeAll && !(isAssigned && actor.permissions.has('approval.read.assigned')) && !isRequester) throw notFound('Approval request');
  const allowSelf = await getSetting(prisma, 'approval.allowSelfApproval');
  const blocker = decisionBlocker(actor, r, allowSelf);
  return { ...r, canDecide: blocker === null, decisionBlocker: blocker };
}

export async function decide(actor: Actor, id: string, input: z.infer<typeof decisionSchema>) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.approvalRequest.findUnique({ where: { id }, include });
    if (!r) throw notFound('Approval request');
    const allowSelf = await getSetting(tx, 'approval.allowSelfApproval');
    const blocker = decisionBlocker(actor, r, allowSelf);
    if (blocker) {
      if (r.status !== 'PENDING' || r.quotation.status !== 'PENDING_APPROVAL') throw conflict(blocker);
      throw forbidden(blocker);
    }
    if (r.quotationVersion !== r.quotation.version) throw unprocessable('The quotation version changed since submission');

    const approved = input.decision === 'APPROVE';
    const now = new Date();
    await tx.approvalRequest.update({
      where: { id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        decidedById: actor.user.id,
        decidedAt: now,
        decisionComment: input.comment ?? null,
        history: { create: { action: approved ? 'APPROVED' : 'REJECTED', actorId: actor.user.id, comment: input.comment ?? null } },
      },
    });
    await tx.quotation.update({
      where: { id: r.quotation.id },
      data: { status: approved ? 'APPROVED' : 'REJECTED', approvedAt: approved ? now : null },
    });
    await notify(tx, [r.requestedById, r.quotation.ownerId], {
      type: 'APPROVAL_DECIDED',
      title: `Quotation ${approved ? 'approved' : 'rejected'}`,
      message: `${r.quotation.number} v${r.quotation.version} was ${approved ? 'approved' : 'rejected'} by ${actor.user.name}${input.comment ? `: "${input.comment}"` : ''}`,
      link: `/quotations/${r.quotation.id}`,
    });
    await audit(tx, actor, {
      action: approved ? 'approval.approved' : 'approval.rejected',
      entityType: 'ApprovalRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: approved ? 'APPROVED' : 'REJECTED', quotationId: r.quotation.id, comment: input.comment },
    });
  });
  return getApproval(actor, id);
}

async function assertApproverRole(roleId: string) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, permissions: { some: { permission: { code: 'approval.decide' } } } },
  });
  if (!role) throw badRequest('The approver role must hold the approval.decide permission');
}

const ruleInclude = { approverRole: { select: { id: true, code: true, name: true } } } as const;

export function listApprovalRules() {
  return prisma.approvalRule.findMany({ include: ruleInclude, orderBy: [{ minAmount: 'asc' }, { priority: 'desc' }] });
}

export async function createApprovalRule(actor: Actor, input: z.infer<typeof ruleSchema>) {
  await assertApproverRole(input.approverRoleId);
  return prisma.$transaction(async (tx) => {
    const r = await tx.approvalRule.create({ data: { ...input, maxAmount: input.maxAmount ?? null }, include: ruleInclude });
    await audit(tx, actor, { action: 'approval_rule.created', entityType: 'ApprovalRule', entityId: r.id, after: r });
    return r;
  });
}

export async function updateApprovalRule(actor: Actor, id: string, input: z.infer<typeof ruleSchema>) {
  await assertApproverRole(input.approverRoleId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.approvalRule.findUnique({ where: { id } });
    if (!before) throw notFound('Approval rule');
    const r = await tx.approvalRule.update({ where: { id }, data: { ...input, maxAmount: input.maxAmount ?? null }, include: ruleInclude });
    await audit(tx, actor, { action: 'approval_rule.updated', entityType: 'ApprovalRule', entityId: id, before, after: r });
    return r;
  });
}

export async function deleteApprovalRule(actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.approvalRule.findUnique({ where: { id } });
    if (!before) throw notFound('Approval rule');
    await tx.approvalRule.delete({ where: { id } });
    await audit(tx, actor, { action: 'approval_rule.deleted', entityType: 'ApprovalRule', entityId: id, before });
  });
}
