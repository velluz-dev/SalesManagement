import { beforeAll, describe, expect, it } from 'vitest';
import { createCustomer, createOrg, createQuotation, item, login, loginAll, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';
import { scanOverdueInvoices } from '../../src/jobs/overdue-scanner';

let sA1: Agent, mA: Agent, finance: Agent, director: Agent;
let customerId: string;
let quotationId: string;

beforeAll(async () => {
  await createOrg();
  [sA1, mA, finance, director] = await loginAll('sa1@test.local', 'ma@test.local', 'finance@test.local', 'director@test.local');
  customerId = await createCustomer(sA1);
  const q = await createQuotation(sA1, customerId, [item(1000, 3)]);
  quotationId = q.id;
  await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
  const req = await prisma.approvalRequest.findFirstOrThrow({ where: { quotationId: q.id } });
  await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' }).expect(200);
  await sA1.post(`/api/quotations/${q.id}/customer-response`).send({ outcome: 'ACCEPTED' }).expect(200);
});

describe('invoices and payments', () => {
  let invoiceId: string;

  it('only invoices approved/accepted quotations, once', async () => {
    const draftQ = await createQuotation(sA1, customerId, [item(10)]);
    expect((await finance.post('/api/invoices').send({ quotationId: draftQ.id })).status).toBe(422);

    const res = await finance.post('/api/invoices').send({ quotationId });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe('3000');
    expect(res.body.data.status).toBe('DRAFT');
    invoiceId = res.body.data.id;
    expect((await finance.post('/api/invoices').send({ quotationId })).status).toBe(422);
  });

  it('issues with credit warning when the limit would be exceeded (warn mode)', async () => {
    const terms = (await finance.get('/api/payment-terms')).body.data as { id: string; name: string; days: number }[];
    const net15 = terms.find((t) => t.name === 'Net 15')!;
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '1000', paymentTermId: net15.id, onHold: false }).expect(200);
    const res = await finance.post(`/api/invoices/${invoiceId}/issue`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ISSUED');
    expect(res.body.data.warnings[0]).toMatch(/Credit limit exceeded/);
    const inv = res.body.data;
    expect((new Date(inv.dueDate).getTime() - new Date(inv.issueDate).getTime()) / 86_400_000).toBe(15);
  });

  it('blocks issuing over the limit when the policy is set to block', async () => {
    await prisma.systemSetting.update({ where: { key: 'credit.blockOnExceed' }, data: { value: true } });
    const manual = await finance.post('/api/invoices').send({ customerId, items: [item(500)] });
    expect(manual.status).toBe(201);
    const res = await finance.post(`/api/invoices/${manual.body.data.id}/issue`).send({});
    expect(res.status).toBe(422);
    await prisma.systemSetting.update({ where: { key: 'credit.blockOnExceed' }, data: { value: false } });
  });

  it('rejects overpayment and tracks partial, paid and void transitions', async () => {
    const over = await finance.post('/api/payments').send({ invoiceId, amount: '3000.01', method: 'CASH', paidAt: new Date().toISOString().slice(0, 10) });
    expect(over.status).toBe(422);

    const today = new Date().toISOString().slice(0, 10);
    const p1 = await finance.post('/api/payments').send({ invoiceId, amount: '1000', method: 'BANK_TRANSFER', paidAt: today });
    expect(p1.status).toBe(201);
    expect((await finance.get(`/api/invoices/${invoiceId}`)).body.data.status).toBe('PARTIALLY_PAID');

    const p2 = await finance.post('/api/payments').send({ invoiceId, amount: '2000', method: 'CARD', paidAt: today });
    expect(p2.status).toBe(201);
    let inv = (await finance.get(`/api/invoices/${invoiceId}`)).body.data;
    expect(inv.status).toBe('PAID');
    expect(inv.balance).toBe('0.00');

    expect((await finance.post(`/api/payments/${p2.body.data.id}/void`).send({})).status).toBe(400);
    await finance.post(`/api/payments/${p2.body.data.id}/void`).send({ reason: 'Card chargeback' }).expect(200);
    inv = (await finance.get(`/api/invoices/${invoiceId}`)).body.data;
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(inv.balance).toBe('2000.00');
    expect(await prisma.auditLog.count({ where: { action: 'payment.voided' } })).toBe(1);
  });

  it('cannot record future-dated payments or pay draft invoices', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect((await finance.post('/api/payments').send({ invoiceId, amount: '1', method: 'CASH', paidAt: future })).status).toBe(400);
    const draft = await finance.post('/api/invoices').send({ customerId, items: [item(10)] });
    const today = new Date().toISOString().slice(0, 10);
    expect((await finance.post('/api/payments').send({ invoiceId: draft.body.data.id, amount: '1', method: 'CASH', paidAt: today })).status).toBe(422);
  });

  it('prevents revising a quotation that has been invoiced', async () => {
    expect((await sA1.post(`/api/quotations/${quotationId}/revise`).send({})).status).toBe(422);
  });

  it('lets directors read but not modify financial records', async () => {
    expect((await director.get(`/api/invoices/${invoiceId}`)).status).toBe(200);
    expect((await director.post(`/api/invoices/${invoiceId}/cancel`).send({ reason: 'x' })).status).toBe(403);
    expect((await director.post('/api/payments').send({})).status).toBe(403);
  });

  it('derives overdue status and notifies finance once per invoice', async () => {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { dueDate: new Date('2020-01-01T00:00:00Z'), issueDate: new Date('2019-12-01T00:00:00Z') } });
    const list = await finance.get('/api/invoices').query({ overdue: 'true' });
    expect(list.body.data.map((i: { id: string }) => i.id)).toContain(invoiceId);
    expect(list.body.data[0].isOverdue).toBe(true);

    await scanOverdueInvoices();
    await scanOverdueInvoices();
    const notes = await prisma.notification.count({ where: { type: 'INVOICE_OVERDUE', dedupeKey: `invoice-overdue:${invoiceId}` } });
    expect(notes).toBe(2);
  });

  it('reports credit exposure from outstanding balances', async () => {
    const res = await finance.get(`/api/credit/${customerId}`);
    expect(res.body.data.exposure).toBe('2000.00');
    expect(res.body.data.overLimit).toBe(true);
  });
});
