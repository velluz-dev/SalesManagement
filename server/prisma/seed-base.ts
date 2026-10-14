import type { PrismaClient } from '@prisma/client';
import { SETTING_DEFINITIONS } from '../src/shared';
import { syncPermissions } from '../src/lib/permission-sync';

export async function seedBase(prisma: PrismaClient, opts: { resetRolePermissions?: boolean } = {}) {
  const { roles } = await syncPermissions(prisma, opts);

  if ((await prisma.paymentTerm.count()) === 0) {
    await prisma.paymentTerm.createMany({
      data: [
        { name: 'COD', days: 0 },
        { name: 'Net 15', days: 15 },
        { name: 'Net 30', days: 30 },
        { name: 'Net 45', days: 45 },
        { name: 'Net 60', days: 60 },
      ],
    });
  }

  for (const d of SETTING_DEFINITIONS) {
    await prisma.systemSetting.upsert({ where: { key: d.key }, create: { key: d.key, value: d.default }, update: {} });
  }

  if ((await prisma.approvalRule.count()) === 0) {
    await prisma.approvalRule.createMany({
      data: [
        { name: 'Standard (team manager)', minAmount: 0, maxAmount: 100_000_000, approverType: 'TEAM_MANAGER', approverRoleId: roles.SALES_MANAGER, priority: 0 },
        { name: 'High value (director)', minAmount: 100_000_000, maxAmount: null, approverType: 'ROLE', approverRoleId: roles.DIRECTOR, priority: 0 },
      ],
    });
  }
  return roles;
}
