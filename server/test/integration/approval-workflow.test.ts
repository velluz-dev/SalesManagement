import { beforeAll, describe, expect, it } from 'vitest';
import { createCustomer, createOrg, createQuotation, item, login, loginAll, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';

let org: Awaited<ReturnType<typeof createOrg>>;
let sA1: Agent, mA: Agent, mB: Agent, director: Agent, finance: Agent;
let customerId: string;

beforeAll(async () => {
  org = await createOrg();
  [sA1, mA, mB, director, finance] = await loginAll('sa1@test.local', 'ma@test.local', 'mb@test.local', 'director@test.local', 'finance@test.local');
  customerId = await createCustomer(sA1);
});

const pendingRequest = (quotationId: string) => prisma.approvalRequest.findFirstOrThrow({ where: { quotationId, status: 'PENDING' } });

describe('quotation approval workflow', () => {
  it('computes totals on the server and ignores client totals', async () => {
    const q = await createQuotation(sA1, customerId, [item(1000, 2, { discountPercent: 10, taxRate: 7 })]);
    expect(q.total).toBe('1926'); // (2000 − 200) × 1.07
    expect(q.status).toBe('DRAFT');
  });

  it('routes a standard quotation to the team manager and runs reject → revise → resubmit → approve', async () => {
    const q = await createQuotation(sA1, customerId, [item(5000, 2)]);
    const submit = await sA1.post(`/api/quotations/${q.id}/submit`).send({ comment: 'Please review' });
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('PENDING_APPROVAL');

    const req = await pendingRequest(q.id);
    expect(req.assignedToId).toBe(org.users.mA.id);

    // Locked while pending
    expect((await sA1.patch(`/api/quotations/${q.id}`).send({ notes: 'x' })).status).toBe(422);

    // The salesperson has no approval authority; another team's manager is not assigned.
    expect((await sA1.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(403);
    expect((await mB.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(403);
    // Directors are not assigned to this request either.
    expect((await director.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(403);

    // Rejection requires a reason
    expect((await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'REJECT' })).status).toBe(400);
    const rejected = await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'REJECT', comment: 'Discount too high' });
    expect(rejected.status).toBe(200);
    expect((await sA1.get(`/api/quotations/${q.id}`)).body.data.status).toBe('REJECTED');

    // Deciding twice is a conflict
    expect((await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(409);

    // Requester notified with the reason
    const note = await prisma.notification.findFirst({ where: { userId: org.users.sA1.id, type: 'APPROVAL_DECIDED' } });
    expect(note?.message).toContain('Discount too high');

    // Revise and resubmit
    expect((await sA1.patch(`/api/quotations/${q.id}`).send({ items: [item(4500, 2)] })).status).toBe(200);
    expect((await sA1.post(`/api/quotations/${q.id}/submit`).send({})).status).toBe(200);
    const req2 = await pendingRequest(q.id);
    const approved = await mA.post(`/api/approvals/${req2.id}/decision`).send({ decision: 'APPROVE', comment: 'OK' });
    expect(approved.status).toBe(200);

    const detail = (await sA1.get(`/api/quotations/${q.id}`)).body.data;
    expect(detail.status).toBe('APPROVED');
    // Full history: two requests, with submit/reject and submit/approve entries
    expect(detail.approvalRequests).toHaveLength(2);
    const actions = detail.approvalRequests.flatMap((r: { history: { action: string }[] }) => r.history.map((h) => h.action)).sort();
    expect(actions).toEqual(['APPROVED', 'REJECTED', 'SUBMITTED', 'SUBMITTED']);

    // Approved quotations are read-only
    expect((await sA1.patch(`/api/quotations/${q.id}`).send({ notes: 'change' })).status).toBe(422);

    // Controlled revision creates v2 and supersedes v1
    const rev = await sA1.post(`/api/quotations/${q.id}/revise`).send({ comment: 'Customer asked for changes' });
    expect(rev.status).toBe(201);
    expect(rev.body.data.version).toBe(2);
    expect(rev.body.data.status).toBe('DRAFT');
    expect(rev.body.data.number).toBe(q.number);
    expect((await sA1.get(`/api/quotations/${q.id}`)).body.data.status).toBe('SUPERSEDED');
  });

  it('routes high-value quotations to the director pool; managers cannot decide them', async () => {
    const q = await createQuotation(sA1, customerId, [item(30000, 2)]); // 60,000
    await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    const req = await pendingRequest(q.id);
    expect(req.assignedToId).toBeNull();
    expect((await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(403);
    const list = await director.get('/api/approvals').query({ status: 'PENDING' });
    expect(list.body.data.find((r: { id: string; canDecide: boolean }) => r.id === req.id)?.canDecide).toBe(true);
    expect((await director.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(200);
  });

  it('never routes a manager’s own quotation to themself (falls back to directors)', async () => {
    const own = await createCustomer(mA, 'Manager customer');
    const q = await createQuotation(mA, own, [item(1000)]);
    await mA.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    const req = await pendingRequest(q.id);
    expect(req.assignedToId).toBeNull();
    const role = await prisma.role.findUniqueOrThrow({ where: { id: req.approverRoleId } });
    expect(role.code).toBe('DIRECTOR');
    const res = await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('blocks self-approval even for a director who owns the quotation, unless policy allows it', async () => {
    // Give the director quotation rights temporarily via a dedicated role to simulate a selling director.
    const sellerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SALESPERSON' } });
    await prisma.userRole.create({ data: { userId: org.users.director.id, roleId: sellerRole.id } });
    const d = await login('director@test.local');
    const cust = await createCustomer(d, 'Director customer');
    const q = await createQuotation(d, cust, [item(60000)]);
    // Only director in the system is the requester → no eligible approver.
    const res = await d.post(`/api/quotations/${q.id}/submit`).send({});
    expect(res.status).toBe(422);

    await prisma.systemSetting.update({ where: { key: 'approval.allowSelfApproval' }, data: { value: true } });
    await d.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    const req = await pendingRequest(q.id);
    expect((await d.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(200);
    await prisma.systemSetting.update({ where: { key: 'approval.allowSelfApproval' }, data: { value: false } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: org.users.director.id, roleId: sellerRole.id } } });
  });

  it('lets the requester withdraw a pending submission', async () => {
    const q = await createQuotation(sA1, customerId, [item(100)]);
    await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    const res = await sA1.post(`/api/quotations/${q.id}/withdraw`).send({});
    expect(res.body.data.status).toBe('DRAFT');
    expect(await prisma.approvalRequest.count({ where: { quotationId: q.id, status: 'CANCELLED' } })).toBe(1);
  });

  it('prevents finance from modifying quotations or approvals', async () => {
    const q = await createQuotation(sA1, customerId, [item(100)]);
    expect((await finance.get(`/api/quotations/${q.id}`)).status).toBe(200);
    expect((await finance.patch(`/api/quotations/${q.id}`).send({ notes: 'x' })).status).toBe(403);
    expect((await finance.post(`/api/quotations/${q.id}/submit`).send({})).status).toBe(403);
  });

  it('refuses submission when no approval rule covers the amount', async () => {
    await prisma.approvalRule.updateMany({ data: { isActive: false } });
    const q = await createQuotation(sA1, customerId, [item(100)]);
    const res = await sA1.post(`/api/quotations/${q.id}/submit`).send({});
    expect(res.status).toBe(422);
    await prisma.approvalRule.updateMany({ data: { isActive: true } });
  });

  it('writes audit entries for submissions and decisions', async () => {
    expect(await prisma.auditLog.count({ where: { action: 'quotation.submitted' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'approval.approved' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'approval.rejected' } })).toBeGreaterThan(0);
  });
});
