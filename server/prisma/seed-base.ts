/**
 * Reference data required by every environment: permissions, system roles, default settings
 * and default approval rules. Idempotent. Also used by the integration test suite.
 */
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, SETTING_DEFINITIONS, type RoleCode } from '@crm/shared';

export async function seedBase(prisma: PrismaClient, opts: { resetRolePermissions?: boolean } = {}) {
  // Permissions
  for (const g of PERMISSION_GROUPS) {
    for (const p of g.permissions) {
      await prisma.permission.upsert({
        where: { code: p.code },
        create: { code: p.code, description: p.description, group: g.group },
        update: { description: p.description, group: g.group },
      });
    }
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  // System roles. Existing role permission sets are only overwritten when explicitly requested,
  // so administrators' runtime changes survive re-seeding.
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
    }
  }

  // Settings (defaults only for keys not yet stored)
  for (const d of SETTING_DEFINITIONS) {
    await prisma.systemSetting.upsert({ where: { key: d.key }, create: { key: d.key, value: d.default }, update: {} });
  }

  // Default approval rules (B1) – only when none exist.
  if ((await prisma.approvalRule.count()) === 0) {
    await prisma.approvalRule.createMany({
      data: [
        { name: 'Standard – team manager', minAmount: 0, maxAmount: 50_000, approverType: 'TEAM_MANAGER', approverRoleId: roles.SALES_MANAGER, priority: 0 },
        { name: 'High value – director', minAmount: 50_000, maxAmount: null, approverType: 'ROLE', approverRoleId: roles.DIRECTOR, priority: 0 },
      ],
    });
  }
  return roles;
}
