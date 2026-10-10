import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, createCustomer, createOrg, login, PASSWORD, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';

let org: Awaited<ReturnType<typeof createOrg>>;
const agents = {} as Record<'sA1' | 'sA2' | 'sB1' | 'mA' | 'mB' | 'director' | 'finance' | 'admin', Agent>;

beforeAll(async () => {
  org = await createOrg();
  for (const k of ['sA1', 'sA2', 'sB1', 'mA', 'mB', 'director', 'finance', 'admin'] as const) {
    agents[k] = await login(org.users[k].email);
  }
});

describe('authentication', () => {
  it('rejects bad credentials with a generic message and audits the failure', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'sa1@test.local', password: 'wrong-password1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email, username or password');
    const unknown = await request(app).post('/api/auth/login').send({ identifier: 'nobody@test.local', password: 'x' });
    expect(unknown.body.error.message).toBe('Incorrect email, username or password');
    expect(await prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBeGreaterThanOrEqual(2);
  });

  it('sets an HttpOnly SameSite session cookie and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'sa1@test.local', password: PASSWORD });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await agents.sA1.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    expect(me.body.data.permissions).toContain('lead.read.own');
  });

  it('requires a session for protected endpoints', async () => {
    expect((await request(app).get('/api/customers')).status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'sa2@test.local', password: PASSWORD });
    const token = /crm_sid=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('invalidates the session on logout', async () => {
    const a = await login('sb1@test.local');
    await a.post('/api/auth/logout').expect(204);
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });

  it('signs in with a username, case-insensitively, and returns it from /me', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: '  SA1 ', password: PASSWORD });
    expect(res.status).toBe(200);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ identifier: 'sa1', password: PASSWORD }).expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.data.user).toMatchObject({ username: 'sa1', email: 'sa1@test.local' });
    await agent.post('/api/auth/logout').expect(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('gives the same generic error for unknown usernames and wrong passwords', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ identifier: 'nobody', password: PASSWORD });
    const wrong = await request(app).post('/api/auth/login').send({ identifier: 'sa1', password: 'wrong-password1' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect((await request(app).post('/api/auth/login').send({ identifier: '', password: PASSWORD })).status).toBe(400);
  });

  it('lets an administrator create and rename users by username, rejecting duplicates and invalid names', async () => {
    const body = { email: 'New.Person@Gmail.com', username: 'New.Person', name: 'New Person', password: 'Password123!x', mustChangePassword: false };
    const created = await agents.admin.post('/api/users').send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: 'new.person@gmail.com', username: 'new.person' });

    const dupe = await agents.admin.post('/api/users').send({ ...body, email: 'other@gmail.com' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.details).toEqual([{ path: 'username', message: 'This username is already taken' }]);

    const both = await agents.admin.post('/api/users').send(body);
    expect(both.body.error.details.map((d: { path: string }) => d.path)).toEqual(['email', 'username']);

    for (const bad of ['ab', '.dot', 'under_', 'has space', 'a@b', 'x'.repeat(33)]) {
      expect((await agents.admin.post('/api/users').send({ ...body, email: 'bad@gmail.com', username: bad })).status).toBe(400);
    }

    const byEmail = request.agent(app);
    await byEmail.post('/api/auth/login').send({ identifier: 'new.person@gmail.com', password: body.password }).expect(200);
    await request(app).post('/api/auth/login').send({ identifier: 'new.person', password: body.password }).expect(200);

    const id = created.body.data.id as string;
    expect((await agents.admin.patch(`/api/users/${id}`).send({ username: 'sa1' })).status).toBe(409);
    expect((await agents.admin.patch(`/api/users/${id}`).send({ username: 'new.person' })).status).toBe(200);
    const renamed = await agents.admin.patch(`/api/users/${id}`).send({ username: 'renamed_person' });
    expect(renamed.body.data.username).toBe('renamed_person');
    await request(app).post('/api/auth/login').send({ identifier: 'new.person', password: body.password }).expect(401);
    await request(app).post('/api/auth/login').send({ identifier: 'renamed_person', password: body.password }).expect(200);
    expect((await agents.admin.get('/api/users').query({ q: 'renamed' })).body.data).toHaveLength(1);
  });

  it('blocks inactive users and revokes sessions on deactivation', async () => {
    const target = await login('sa2@test.local');
    const res = await agents.admin.patch(`/api/users/${org.users.sA2.id}/status`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await target.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'sa2@test.local', password: PASSWORD })).status).toBe(401);
    await agents.admin.patch(`/api/users/${org.users.sA2.id}/status`).send({ isActive: true }).expect(200);
    agents.sA2 = await login('sa2@test.local');
  });

  it('rejects cross-site state-changing requests (CSRF defence)', async () => {
    const res = await agents.sA1.post('/api/customers').set('Origin', 'https://evil.example').send({ name: 'X' });
    expect(res.status).toBe(403);
    const res2 = await agents.sA1.post('/api/customers').set('Sec-Fetch-Site', 'cross-site').send({ name: 'X' });
    expect(res2.status).toBe(403);
  });
});

describe('role-based endpoint authorization', () => {
  const cases: [keyof typeof agents, string, string, number][] = [
    ['sA1', 'get', '/api/users', 403],
    ['sA1', 'get', '/api/invoices', 403],
    ['sA1', 'get', '/api/audit-logs', 403],
    ['finance', 'get', '/api/leads', 403],
    ['finance', 'post', '/api/quotations', 403],
    ['director', 'post', '/api/customers', 403],
    ['director', 'post', '/api/invoices', 403],
    ['admin', 'get', '/api/customers', 403],
    ['admin', 'get', '/api/quotations', 403],
    ['admin', 'get', '/api/invoices', 403],
    ['mA', 'get', '/api/users', 403],
    ['mA', 'get', '/api/invoices', 403],
  ];
  it.each(cases)('%s %s %s returns %i', async (who, method, url, status) => {
    const res = await (agents[who] as unknown as Record<string, (u: string) => request.Test>)[method]!(url).send({});
    expect(res.status).toBe(status);
  });

  it('does not give the administrator approval authority', async () => {
    const res = await agents.admin.post('/api/approvals/00000000-0000-0000-0000-000000000000/decision').send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });
});

describe('data scoping (ownership and teams)', () => {
  let leadA1: string;
  let leadA2: string;
  let leadB1: string;

  beforeAll(async () => {
    leadA1 = (await agents.sA1.post('/api/leads').send({ title: 'A1 lead', contactName: 'X' })).body.data.id;
    leadA2 = (await agents.sA2.post('/api/leads').send({ title: 'A2 lead', contactName: 'Y' })).body.data.id;
    leadB1 = (await agents.sB1.post('/api/leads').send({ title: 'B1 lead', contactName: 'Z' })).body.data.id;
  });

  it('salespeople only see their own records', async () => {
    const list = await agents.sA1.get('/api/leads');
    expect(list.body.data.map((l: { id: string }) => l.id)).toEqual([leadA1]);
    expect((await agents.sA1.get(`/api/leads/${leadA2}`)).status).toBe(404);
    expect((await agents.sA1.patch(`/api/leads/${leadA2}`).send({ title: 'hijack' })).status).toBe(404);
  });

  it('managers see their team but not other teams', async () => {
    const ids = (await agents.mA.get('/api/leads')).body.data.map((l: { id: string }) => l.id);
    expect(ids).toEqual(expect.arrayContaining([leadA1, leadA2]));
    expect(ids).not.toContain(leadB1);
    expect((await agents.mB.get(`/api/leads/${leadA1}`)).status).toBe(404);
  });

  it('directors see everything (read-only)', async () => {
    const ids = (await agents.director.get('/api/leads')).body.data.map((l: { id: string }) => l.id);
    expect(ids).toEqual(expect.arrayContaining([leadA1, leadA2, leadB1]));
    expect((await agents.director.patch(`/api/leads/${leadA1}`).send({ title: 'x' })).status).toBe(403);
  });

  it('prevents assigning records to other users without lead.assign (mass assignment)', async () => {
    const res = await agents.sA1.post('/api/leads').send({ title: 'T', contactName: 'C', ownerId: org.users.sA2.id });
    expect(res.status).toBe(403);
  });

  it('lets managers assign only within their team', async () => {
    expect((await agents.mA.post('/api/leads').send({ title: 'T', contactName: 'C', ownerId: org.users.sA2.id })).status).toBe(201);
    expect((await agents.mA.post('/api/leads').send({ title: 'T', contactName: 'C', ownerId: org.users.sB1.id })).status).toBe(403);
  });

  it('rejects unknown fields on strict schemas', async () => {
    const customerId = await createCustomer(agents.sA1);
    const res = await agents.sA1.post('/api/quotations').send({ customerId, items: [{ description: 'x', quantity: 1, unitPrice: 1 }], status: 'APPROVED', total: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cannot create a quotation for a customer outside scope', async () => {
    const otherCustomer = await createCustomer(agents.sB1, 'B only');
    const res = await agents.sA1.post('/api/quotations').send({ customerId: otherCustomer, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(400);
  });

  it('returns consistent validation errors', async () => {
    const res = await agents.sA1.post('/api/leads').send({ title: '', contactName: 'x', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['title', 'email']));
  });
});
