import type { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, SETTING_DEFINITIONS, type RoleCode } from '../src/shared';

export async function seedBase(prisma: PrismaClient, opts: { resetRolePermissions?: boolean } = {}) {
  const known = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  const introduced = new Set<string>();
  for (const g of PERMISSION_GROUPS) {
    for (const p of g.permissions) {
      await prisma.permission.upsert({
        where: { code: p.code },
        create: { code: p.code, description: p.description, group: g.group },
        update: { description: p.description, group: g.group },
      });
      if (known.size && !known.has(p.code)) introduced.add(p.code);
    }
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  const roles = {} as Record<RoleCode, string>;
  for (const [code, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [RoleCode, (typeof DEFAULT_ROLE_PERMISSIONS)[RoleCode]][]) {
    const existing = await prisma.role.findUnique({ where: { code } });
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true },
    });
    roles[code] = role.id;
    if (!existing || opts.resetRolePermissions) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: def.permissions.map((c) => ({ roleId: role.id, permissionId: perms.get(c)! })),
      });
    } else if (introduced.size) {
      // Permissions added by an upgrade go to the system roles that have them by default; other customisations are kept.
      const additions = def.permissions.filter((c) => introduced.has(c));
      await prisma.rolePermission.createMany({
        data: additions.map((c) => ({ roleId: role.id, permissionId: perms.get(c)! })),
        skipDuplicates: true,
      });
    }
  }

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
