import { Prisma, type ApprovalRule, type Role } from '@prisma/client';
import type { Db } from '../../lib/prisma';
import { unprocessable } from '../../lib/errors';
import { getSetting } from '../../lib/settings';

export function selectRule<R extends Pick<ApprovalRule, 'minAmount' | 'maxAmount' | 'priority' | 'isActive'>>(
  rules: R[],
  amount: Prisma.Decimal,
): R | undefined {
  return rules
    .filter((r) => r.isActive && amount.gte(r.minAmount) && (r.maxAmount === null || amount.lt(r.maxAmount)))
    .sort((a, b) => b.priority - a.priority || Number(b.minAmount.sub(a.minAmount)))[0];
}

export function isSelfApproval(approverId: string, requestedById: string, ownerId: string) {
  return approverId === requestedById || approverId === ownerId;
}

export interface ApproverAssignment {
  rule: ApprovalRule;
  approverRole: Role;
  assignedToId: string | null;
  eligibleUserIds: string[];
}

async function eligibleHolders(db: Db, roleId: string, exclude: string[]) {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      id: { notIn: exclude },
      roles: { some: { roleId, role: { permissions: { some: { permission: { code: 'approval.decide' } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function resolveApprover(
  db: Db,
  q: { total: Prisma.Decimal; ownerId: string; requestedById: string },
): Promise<ApproverAssignment> {
  const rules = await db.approvalRule.findMany({ where: { isActive: true }, include: { approverRole: true } });
  const rule = selectRule(rules, q.total);
  if (!rule) {
    throw unprocessable(`No approval rule is configured for an amount of ${q.total.toFixed(2)}. Ask an administrator to configure approval rules.`);
  }

  const allowSelf = await getSetting(db, 'approval.allowSelfApproval');
  const exclude = allowSelf ? [] : [q.requestedById, q.ownerId];

  if (rule.approverType === 'TEAM_MANAGER') {
    const owner = await db.user.findUnique({
      where: { id: q.ownerId },
      select: { team: { select: { managerId: true } } },
    });
    const managerId = owner?.team?.managerId;
    if (managerId && !exclude.includes(managerId)) {
      const holders = await eligibleHolders(db, rule.approverRoleId, []);
      if (holders.includes(managerId)) {
        return { rule, approverRole: rule.approverRole, assignedToId: managerId, eligibleUserIds: [managerId] };
      }
    }
    const fallbackCode = await getSetting(db, 'approval.fallbackRoleCode');
    const fallbackRole = await db.role.findUnique({ where: { code: fallbackCode } });
    if (!fallbackRole) throw unprocessable(`Fallback approval role "${fallbackCode}" does not exist`);
    const pool = await eligibleHolders(db, fallbackRole.id, exclude);
    if (!pool.length) throw unprocessable('No eligible approver is available for this quotation');
    return { rule, approverRole: fallbackRole, assignedToId: null, eligibleUserIds: pool };
  }

  const pool = await eligibleHolders(db, rule.approverRoleId, exclude);
  if (!pool.length) throw unprocessable('No eligible approver is available for this quotation');
  return { rule, approverRole: rule.approverRole, assignedToId: null, eligibleUserIds: pool };
}
