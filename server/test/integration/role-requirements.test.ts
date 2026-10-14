import { beforeAll, describe, expect, it } from 'vitest';
import { createCustomer, createOrg, createQuotation, item, loginAll, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';
import { expireQuotations, scanFollowUps, scanInvoicesDueSoon } from '../../src/jobs/overdue-scanner';
import { addDays, startOfTodayUtc } from '../../src/lib/dates';

let org: Awaited<ReturnType<typeof createOrg>>;
let sA1: Agent, sA2: Agent, mA: Agent, finance: Agent, director: Agent;
let customerId: string;

async function approve(quotationId: string) {
  const req = await prisma.approvalRequest.findFirstOrThrow({ where: { quotationId, status: 'PENDING' } });
  const approver = req.amount.gte(100_000_000) ? director : mA;
  await approver.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' }).expect(200);
}

async function acceptedQuotation(lines = [item(1000, 3)]) {
  const q = await createQuotation(sA1, customerId, lines);
  await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
  await approve(q.id);
  await sA1.post(`/api/quotations/${q.id}/customer-response`).send({ outcome: 'ACCEPTED' }).expect(200);
  return q;
}

beforeAll(async () => {
  org = await createOrg();
  [sA1, sA2, mA, finance, director] = await loginAll('sa1@test.local', 'sa2@test.local', 'ma@test.local', 'finance@test.local', 'director@test.local');
  customerId = await createCustomer(sA1, 'Golden Dealer Co');
});

describe('salesperson: lead follow-ups', () => {
  it('schedules a follow-up on a lead and lists it when due', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const lead = (await sA1.post('/api/leads').send({ title: 'Cement supply', contactName: 'U Aung', nextFollowUpAt: past })).body.data;
    expect(lead.nextFollowUpAt).toBe(past);
    const overdue = (await sA1.get('/api/leads').query({ followUp: 'overdue' })).body.data.map((l: { id: string }) => l.id);
    expect(overdue).toContain(lead.id);
    expect((await sA2.get('/api/leads').query({ followUp: 'overdue' })).body.data).toHaveLength(0);
  });

  it('reminds the owner once per scheduled follow-up', async () => {
    await sA1
      .post('/api/activities')
      .send({ type: 'CALL', subject: 'Call about pricing', dueAt: new Date(Date.now() - 60_000).toISOString(), customerId })
      .expect(201);
    await scanFollowUps();
    await scanFollowUps();
    const notes = await prisma.notification.findMany({ where: { userId: org.users.sA1.id, type: 'FOLLOW_UP_DUE' } });
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.title)).toEqual(expect.arrayContaining(['Overdue: Call about pricing', 'Follow up with U Aung']));
  });

  it('clears the follow-up when the lead is converted', async () => {
    const lead = (await sA1.post('/api/leads').send({ title: 'Steel bars', contactName: 'Daw Hla', nextFollowUpAt: new Date().toISOString() })).body.data;
    await sA1.post(`/api/leads/${lead.id}/convert`).send({ customerId }).expect(200);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).nextFollowUpAt).toBeNull();
  });
});

describe('salesperson: credit terms on quotations', () => {
  it('defaults the payment term from the customer and lets the seller negotiate another', async () => {
    const net30 = await prisma.paymentTerm.findUniqueOrThrow({ where: { name: 'Net 30' } });
    const net45 = await prisma.paymentTerm.findUniqueOrThrow({ where: { name: 'Net 45' } });
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '5000', paymentTermId: net30.id, onHold: false }).expect(200);
    const q = await createQuotation(sA1, customerId);
    expect((await sA1.get(`/api/quotations/${q.id}`)).body.data.paymentTerm.name).toBe('Net 30');
    const res = await sA1.patch(`/api/quotations/${q.id}`).send({ paymentTermId: net45.id });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentTerm.name).toBe('Net 45');
  });

  it('shows available credit and warns the approver when the deal exceeds the limit', async () => {
    const q = await createQuotation(sA1, customerId, [item(6000)]);
    const detail = (await sA1.get(`/api/quotations/${q.id}`)).body.data;
    expect(detail.credit).toMatchObject({ limit: '5000.00', available: '5000.00', onHold: false });
    expect(detail.credit.warnings[0]).toMatch(/Credit limit exceeded/);
    const submitted = (await sA1.post(`/api/quotations/${q.id}/submit`).send({})).body.data;
    expect(submitted.warnings[0]).toMatch(/Credit limit exceeded/);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: org.users.mA.id, type: 'APPROVAL_REQUESTED' }, orderBy: { createdAt: 'desc' } });
    expect(note.message).toMatch(/Credit limit exceeded/);
  });

  it('bills the invoice on the agreed term, not the customer default', async () => {
    const net45 = await prisma.paymentTerm.findUniqueOrThrow({ where: { name: 'Net 45' } });
    const q = await createQuotation(sA1, customerId, [item(500)]);
    await sA1.patch(`/api/quotations/${q.id}`).send({ paymentTermId: net45.id }).expect(200);
    await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    await approve(q.id);
    await sA1.post(`/api/quotations/${q.id}/customer-response`).send({ outcome: 'ACCEPTED' }).expect(200);
    const order = (await sA1.post('/api/sales-orders').send({ quotationId: q.id })).body.data;
    expect(order.paymentTerm.name).toBe('Net 45');
    await sA1.post(`/api/sales-orders/${order.id}/confirm`).send({}).expect(200);
    const inv = (await finance.post('/api/invoices').send({ salesOrderId: order.id })).body.data;
    const issued = (await finance.post(`/api/invoices/${inv.id}/issue`).send({})).body.data;
    expect(issued.paymentTerm.name).toBe('Net 45');
    expect((new Date(issued.dueDate).getTime() - new Date(issued.issueDate).getTime()) / 86_400_000).toBe(45);
    expect((await sA1.post('/api/sales-orders').send({ quotationId: q.id })).status).toBe(422);
  });
});

describe('salesperson: quotation validity', () => {
  it('expires stale offers, blocks sending them and allows a revised offer', async () => {
    const q = await createQuotation(sA1, customerId, [item(100)]);
    await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
    await approve(q.id);
    await prisma.quotation.update({ where: { id: q.id }, data: { validUntil: addDays(startOfTodayUtc(), -1) } });
    expect((await sA1.post(`/api/quotations/${q.id}/send`).send({})).status).toBe(422);
    await expireQuotations();
    expect((await sA1.get(`/api/quotations/${q.id}`)).body.data.status).toBe('EXPIRED');
    expect(await prisma.notification.count({ where: { userId: org.users.sA1.id, type: 'QUOTATION_EXPIRED' } })).toBe(1);
    const revised = await sA1.post(`/api/quotations/${q.id}/revise`).send({});
    expect(revised.status).toBe(201);
    expect(revised.body.data.version).toBe(2);
  });
});

describe('contracts: orders stay within the contract value', () => {
  it('blocks confirming orders beyond the agreed value', async () => {
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '100000000', onHold: false }).expect(200);
    const q = await acceptedQuotation([item(1000, 3)]);
    const contract = (await sA1.post('/api/contracts').send({ quotationId: q.id })).body.data;
    expect((await sA1.post('/api/sales-orders').send({ quotationId: q.id })).status).toBe(422);
    const first = (await sA1.post('/api/sales-orders').send({ contractId: contract.id })).body.data;
    await sA1.post(`/api/sales-orders/${first.id}/confirm`).send({}).expect(200);
    expect((await sA1.post('/api/sales-orders').send({ contractId: contract.id })).status).toBe(422);
  });
});

describe('finance: payment reminders', () => {
  it('reminds finance and the salesperson before an invoice falls due', async () => {
    const inv = (await finance.post('/api/invoices').send({ customerId, items: [item(250)] })).body.data;
    const due = addDays(startOfTodayUtc(), 2).toISOString().slice(0, 10);
    await finance.post(`/api/invoices/${inv.id}/issue`).send({ dueDate: due }).expect(200);
    await scanInvoicesDueSoon();
    await scanInvoicesDueSoon();
    const notes = await prisma.notification.findMany({ where: { type: 'INVOICE_DUE_SOON', link: `/invoices/${inv.id}` } });
    expect(notes.map((n) => n.userId).sort()).toEqual([org.users.finance.id, org.users.sA1.id].sort());
  });

  it('shows the customer balance and remaining credit on the customer record', async () => {
    const account = (await sA1.get(`/api/customers/${customerId}`)).body.data.account;
    expect(Number(account.outstanding)).toBeGreaterThan(0);
    expect(account.creditLimit).toBe('100000000.00');
    expect(Number(account.available)).toBe(100_000_000 - Number(account.outstanding));
  });
});

describe('manager and director: team oversight', () => {
  it('gives the manager a per-member view with targets and follow-ups', async () => {
    const now = new Date();
    await mA.post('/api/targets').send({ userId: org.users.sA1.id, periodType: 'MONTH', year: now.getUTCFullYear(), period: now.getUTCMonth() + 1, amount: '10000' }).expect(201);
    const sales = (await mA.get('/api/dashboard')).body.data.sales;
    const sa1 = sales.team.members.find((m: { id: string }) => m.id === org.users.sA1.id);
    expect(sa1).toMatchObject({ target: '10000.00' });
    expect(sa1.overdueFollowUps).toBeGreaterThanOrEqual(1);
    expect(sales.team.members.map((m: { id: string }) => m.id)).not.toContain(org.users.sB1.id);
    expect(sales.team.teams).toBeNull();
    expect(sales.followUps.overdue).toBeGreaterThanOrEqual(1);
    expect((await sA1.get('/api/dashboard')).body.data.sales.team).toBeNull();
  });

  it('gives the director a company view by team, company targets and all follow-ups', async () => {
    const sales = (await director.get('/api/dashboard')).body.data.sales;
    expect(sales.team.teams.map((t: { name: string }) => t.name)).toEqual(['Team A', 'Team B']);
    const now = new Date();
    const res = await director.post('/api/targets').send({ teamId: org.teamB.id, periodType: 'MONTH', year: now.getUTCFullYear(), period: now.getUTCMonth() + 1, amount: '50000' });
    expect(res.status).toBe(201);
    expect((await director.get('/api/activities')).status).toBe(200);
  });

  it('forecasts the open pipeline by expected close month', async () => {
    const close = addDays(startOfTodayUtc(), 40).toISOString().slice(0, 10);
    await sA1.post('/api/opportunities').send({ name: 'Warehouse racking', customerId, amount: '20000', probability: 50, expectedCloseDate: close }).expect(201);
    const forecast = (await mA.get('/api/reports/sales')).body.data.forecast;
    expect(forecast.months).toHaveLength(6);
    const month = forecast.months.find((m: { month: string }) => m.month === close.slice(0, 7));
    expect(month).toMatchObject({ amount: '20000.00', weighted: '10000.00', count: 1 });
  });
});
