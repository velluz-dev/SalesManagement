import request from 'supertest';
import type { RoleCode } from '../src/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { seedBase } from '../prisma/seed-base';

export const app = createApp();
export const PASSWORD = 'TestPassw0rd!';

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  return seedBase(prisma);
}

let hashed: string | undefined;
export async function createUser(email: string, role: RoleCode | null, opts: { teamId?: string; isActive?: boolean } = {}) {
  hashed ??= await hashPassword(PASSWORD);
  const r = role ? await prisma.role.findUniqueOrThrow({ where: { code: role } }) : null;
  return prisma.user.create({
    data: {
      email,
      username: email.split('@')[0]!,
      name: email.split('@')[0]!,
      passwordHash: hashed,
      teamId: opts.teamId ?? null,
      isActive: opts.isActive ?? true,
      ...(r ? { roles: { create: { roleId: r.id } } } : {}),
    },
  });
}

export async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identifier: email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export type Agent = Awaited<ReturnType<typeof login>>;

export async function createOrg() {
  await resetDb();
  const teamA = await prisma.team.create({ data: { name: 'Team A' } });
  const teamB = await prisma.team.create({ data: { name: 'Team B' } });
  const mA = await createUser('ma@test.local', 'SALES_MANAGER', { teamId: teamA.id });
  const mB = await createUser('mb@test.local', 'SALES_MANAGER', { teamId: teamB.id });
  await prisma.team.update({ where: { id: teamA.id }, data: { managerId: mA.id } });
  await prisma.team.update({ where: { id: teamB.id }, data: { managerId: mB.id } });
  const users = {
    mA,
    mB,
    sA1: await createUser('sa1@test.local', 'SALESPERSON', { teamId: teamA.id }),
    sA2: await createUser('sa2@test.local', 'SALESPERSON', { teamId: teamA.id }),
    sB1: await createUser('sb1@test.local', 'SALESPERSON', { teamId: teamB.id }),
    director: await createUser('director@test.local', 'DIRECTOR'),
    finance: await createUser('finance@test.local', 'FINANCE_OFFICER'),
    admin: await createUser('admin@test.local', 'SYSTEM_ADMIN'),
  };
  return { teamA, teamB, users };
}

export const item = (unitPrice: number, quantity = 1, extra: Record<string, unknown> = {}) => ({
  description: `Item ${unitPrice}`,
  quantity,
  unitPrice,
  ...extra,
});

export async function createCustomer(agent: Agent, name = 'Customer Co') {
  const res = await agent.post('/api/customers').send({ name });
  if (res.status !== 201) throw new Error(`createCustomer: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as string;
}

export async function createQuotation(agent: Agent, customerId: string, items = [item(1000, 2)]) {
  const res = await agent.post('/api/quotations').send({ customerId, items });
  if (res.status !== 201) throw new Error(`createQuotation: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; total: string; status: string; number: string; version: number };
}

export function loginAll<const T extends readonly string[]>(...emails: T) {
  return Promise.all(emails.map(login)) as Promise<{ [K in keyof T]: Agent }>;
}
