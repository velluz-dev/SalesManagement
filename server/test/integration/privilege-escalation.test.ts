import { beforeAll, describe, expect, it } from 'vitest';
import { createOrg, createUser, login, loginAll, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';

let org: Awaited<ReturnType<typeof createOrg>>;
let admin: Agent, sA1: Agent, mA: Agent;
let roles: Record<string, string>;

let a2: Agent;

beforeAll(async () => {
  org = await createOrg();
  [admin, sA1, mA] = await loginAll('admin@test.local', 'sa1@test.local', 'ma@test.local');
  roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  await createUser('admin2@test.local', 'SYSTEM_ADMIN');
  a2 = await login('admin2@test.local');
});

describe('privilege escalation protections', () => {
  it('non-admins cannot assign roles or edit role permissions', async () => {
    expect((await sA1.put(`/api/users/${org.users.sA1.id}/roles`).send({ roleIds: [roles.SYSTEM_ADMIN] })).status).toBe(403);
    expect((await mA.patch(`/api/roles/${roles.SALES_MANAGER}`).send({ permissions: ['invoice.read'] })).status).toBe(403);
  });

  it('admins cannot change their own roles or status', async () => {
    expect((await admin.put(`/api/users/${org.users.admin.id}/roles`).send({ roleIds: [roles.SYSTEM_ADMIN, roles.DIRECTOR] })).status).toBe(403);
    expect((await admin.patch(`/api/users/${org.users.admin.id}/status`).send({ isActive: false })).status).toBe(403);
  });

  it('admins cannot edit the permission set of a role they hold', async () => {
    const res = await admin.patch(`/api/roles/${roles.SYSTEM_ADMIN}`).send({ permissions: ['approval.decide', 'role.manage'] });
    expect(res.status).toBe(403);
  });

  it('rejects unknown permission codes', async () => {
    const res = await admin.patch(`/api/roles/${roles.SALESPERSON}`).send({ permissions: ['lead.read.own', 'god.mode'] });
    expect(res.status).toBe(400);
  });

  it('keeps at least one active user with role-management permission', async () => {
    const perms = await prisma.permission.findMany({ where: { code: { in: ['user.read', 'user.deactivate', 'role.assign', 'role.read'] } } });
    const delegated = await prisma.role.create({
      data: { code: 'USER_ADMIN', name: 'User admin', permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
    });
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: org.users.admin.id } })).passwordHash;
    await prisma.user.create({ data: { email: 'useradmin@test.local', username: 'useradmin', name: 'useradmin', passwordHash: hash, roles: { create: { roleId: delegated.id } } } });
    const ua = await login('useradmin@test.local');

    await prisma.user.update({ where: { email: 'admin2@test.local' }, data: { isActive: false } });
    expect((await ua.patch(`/api/users/${org.users.admin.id}/status`).send({ isActive: false })).status).toBe(422);
    expect((await ua.put(`/api/users/${org.users.admin.id}/roles`).send({ roleIds: [] })).status).toBe(422);
    expect(await prisma.userRole.count({ where: { userId: org.users.admin.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: org.users.admin.id } })).isActive).toBe(true);
    await prisma.user.update({ where: { email: 'admin2@test.local' }, data: { isActive: true } });
  });

  it('permission changes take effect on the next request', async () => {
    const before = (await a2.get('/api/roles')).body.data.find((r: { code: string }) => r.code === 'SALESPERSON').permissions as string[];
    expect((await sA1.get('/api/invoices')).status).toBe(403);
    await a2.patch(`/api/roles/${roles.SALESPERSON}`).send({ permissions: [...before, 'invoice.read'] }).expect(200);
    expect((await sA1.get('/api/invoices')).status).toBe(200);
    await a2.patch(`/api/roles/${roles.SALESPERSON}`).send({ permissions: before }).expect(200);
    expect((await sA1.get('/api/invoices')).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'role.updated' } })).toBe(2);
  });

  it('managers cannot set their own targets or targets outside their team', async () => {
    const year = new Date().getFullYear();
    const own = await mA.post('/api/targets').send({ userId: org.users.mA.id, periodType: 'MONTH', year, period: 1, amount: '1000' });
    expect(own.status).toBe(403);
    const other = await mA.post('/api/targets').send({ userId: org.users.sB1.id, periodType: 'MONTH', year, period: 1, amount: '1000' });
    expect(other.status).toBe(403);
    const ok = await mA.post('/api/targets').send({ userId: org.users.sA1.id, periodType: 'MONTH', year, period: 1, amount: '1000' });
    expect(ok.status).toBe(201);
    expect((await sA1.get('/api/targets')).body.data).toHaveLength(1);
    expect((await sA1.delete(`/api/targets/${ok.body.data.id}`)).status).toBe(403);
  });

  it('rejects unknown setting keys and invalid values', async () => {
    expect((await a2.put('/api/settings').send({ 'evil.key': true })).status).toBe(400);
    expect((await a2.put('/api/settings').send({ 'quotation.defaultTaxRate': 500 })).status).toBe(400);
    expect((await a2.put('/api/settings').send({ 'quotation.defaultTaxRate': 7 })).status).toBe(200);
  });

  it('approval rules may only target roles with approval authority', async () => {
    const res = await a2.post('/api/approval-rules').send({ name: 'Admin route', minAmount: '0', approverType: 'ROLE', approverRoleId: roles.SYSTEM_ADMIN });
    expect(res.status).toBe(400);
  });
});
