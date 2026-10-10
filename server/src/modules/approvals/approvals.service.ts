import { z } from 'zod';
import { APPROVAL_STATUSES } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged } from '../../lib/pagination';
import { getSetting } from '../../lib/settings';
import { optionalText } from '../../lib/validation';
import { ownerSelect } from '../../lib/ownership';
import { isSelfApproval } from './approval-engine';

export const listApprovalsQuery = listQuery(['createdAt', 'amount', 'decidedAt'] as const).extend({
  status: z.enum(APPROVAL_STATUSES).optional(),
  view: z.enum(['assigned', 'all']).default('assigned'),
});

export const decisionSchema = z
  .strictObject({ decision: z.enum(['APPROVE', 'REJECT']), comment: optionalText(2000) })
  .refine((v) => v.decision === 'APPROVE' || (v.comment && v.comment.length >= 3), {
    message: 'A rejection reason is required',
    path: ['comment'],
  });

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
