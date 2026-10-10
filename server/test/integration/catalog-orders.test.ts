import { beforeAll, describe, expect, it } from 'vitest';
import { createCustomer, createOrg, createQuotation, item, loginAll, type Agent } from '../helpers';
import { prisma } from '../../src/lib/prisma';

let org: Awaited<ReturnType<typeof createOrg>>;
let sA1: Agent, sA2: Agent, mA: Agent, mB: Agent, finance: Agent, director: Agent, admin: Agent;
let customerId: string;
let productId: string;

/** Takes a quotation through approval to customer acceptance. */
async function acceptedQuotation(lines = [item(1000, 3)]) {
  const q = await createQuotation(sA1, customerId, lines);
  await sA1.post(`/api/quotations/${q.id}/submit`).send({}).expect(200);
  const req = await prisma.approvalRequest.findFirstOrThrow({ where: { quotationId: q.id, status: 'PENDING' } });
  await mA.post(`/api/approvals/${req.id}/decision`).send({ decision: 'APPROVE' }).expect(200);
  await sA1.post(`/api/quotations/${q.id}/customer-response`).send({ outcome: 'ACCEPTED' }).expect(200);
  return q;
}

beforeAll(async () => {
  org = await createOrg();
  [sA1, sA2, mA, mB, finance, director, admin] = await loginAll(
    'sa1@test.local', 'sa2@test.local', 'ma@test.local', 'mb@test.local', 'finance@test.local', 'director@test.local', 'admin@test.local',
  );
  customerId = await createCustomer(sA1, 'Dealer Co');
});

describe('product catalog', () => {
  it('lets sales managers maintain products and everyone in sales read them', async () => {
    const res = await mA.post('/api/products').send({ code: 'cbl-cat6', name: 'Cat6 cable', unit: 'box', category: 'Hardware', listPrice: '180.00' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('CBL-CAT6'); // normalised to upper case
    productId = res.body.data.id;
    expect((await sA1.get('/api/products')).body.data.map((p: { id: string }) => p.id)).toContain(productId);
    expect((await sA1.post('/api/products').send({ code: 'X1', name: 'x', listPrice: '1' })).status).toBe(403);
    expect((await admin.get('/api/products')).status).toBe(403); // admin has no business data
    expect((await mA.post('/api/products').send({ code: 'CBL-CAT6', name: 'dupe', listPrice: '1' })).status).toBe(409);
  });

  it('records price changes and hides discontinued products from sellers', async () => {
    await mA.patch(`/api/products/${productId}`).send({ listPrice: '195.00' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'product.price_changed', entityId: productId } })).toBe(1);
    const legacy = (await mA.post('/api/products').send({ code: 'OLD-1', name: 'Old scanner', listPrice: '50', isActive: false })).body.data;
    expect((await sA1.get('/api/products')).body.data.map((p: { id: string }) => p.id)).not.toContain(legacy.id);
    expect((await mA.get('/api/products?isActive=false')).body.data.map((p: { id: string }) => p.id)).toContain(legacy.id);
    // A discontinued product cannot be put on a new quotation.
    const res = await sA1.post('/api/quotations').send({ customerId, items: [{ productId: legacy.id, description: 'Old', quantity: 1, unitPrice: '50' }] });
    expect(res.status).toBe(400);
  });

  it('links quotation lines to products', async () => {
    const res = await sA1.post('/api/quotations').send({ customerId, items: [{ productId, description: 'Cat6 cable', quantity: 10, unitPrice: '195.00' }] });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].product.code).toBe('CBL-CAT6');
  });
});

describe('payment terms', () => {
  it('are readable by everyone and managed only by finance', async () => {
    const terms = (await sA1.get('/api/payment-terms')).body.data as { name: string; days: number }[];
    expect(terms.map((t) => t.name)).toEqual(expect.arrayContaining(['COD', 'Net 30', 'Net 60']));
    expect((await sA1.post('/api/payment-terms').send({ name: 'Net 90', days: 90 })).status).toBe(403);
    expect((await finance.post('/api/payment-terms').send({ name: 'Net 90', days: 90 })).status).toBe(201);
    expect((await finance.post('/api/payment-terms').send({ name: 'Net 999', days: 999 })).status).toBe(400);
  });

  it('drive invoice due dates, and in-use terms cannot be deleted', async () => {
    const net60 = (await prisma.paymentTerm.findUniqueOrThrow({ where: { name: 'Net 60' } }));
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '1000000', paymentTermId: net60.id, onHold: false }).expect(200);
    const inv = (await finance.post('/api/invoices').send({ customerId, items: [item(100)] })).body.data;
    const issued = (await finance.post(`/api/invoices/${inv.id}/issue`).send({})).body.data;
    expect((new Date(issued.dueDate).getTime() - new Date(issued.issueDate).getTime()) / 86_400_000).toBe(60);
    expect(issued.paymentTerm.name).toBe('Net 60');
    expect((await finance.delete(`/api/payment-terms/${net60.id}`)).status).toBe(409);
  });

  it('cannot be set on a customer by sales staff (it is a credit decision)', async () => {
    const term = await prisma.paymentTerm.findUniqueOrThrow({ where: { name: 'COD' } });
    expect((await sA1.patch(`/api/customers/${customerId}`).send({ paymentTermId: term.id })).status).toBe(400); // unknown field
    expect((await sA1.put(`/api/credit/${customerId}`).send({ creditLimit: '1', paymentTermId: term.id })).status).toBe(403);
  });
});

describe('contracts', () => {
  let contractId: string;

  it('are created only from accepted quotations, once, with the quotation value', async () => {
    const draft = await createQuotation(sA1, customerId, [item(10)]);
    expect((await sA1.post('/api/contracts').send({ quotationId: draft.id })).status).toBe(422);

    const q = await acceptedQuotation([item(2000, 5)]);
    const res = await sA1.post('/api/contracts').send({ quotationId: q.id, title: 'Supply agreement', endDate: '2099-12-31', documentUrl: 'https://docs.example.com/c1.pdf' });
    expect(res.status).toBe(201);
    expect(res.body.data.value).toBe('10000');
    expect(res.body.data.status).toBe('ACTIVE');
    contractId = res.body.data.id;
    expect((await sA1.post('/api/contracts').send({ quotationId: q.id })).status).toBe(422);
  });

  it('reject unsafe document links', async () => {
    const res = await sA1.patch(`/api/contracts/${contractId}`).send({ documentUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('are scoped by owner and team', async () => {
    expect((await sA2.get(`/api/contracts/${contractId}`)).status).toBe(404);
    expect((await mB.get(`/api/contracts/${contractId}`)).status).toBe(404);
    expect((await mA.get(`/api/contracts/${contractId}`)).status).toBe(200);
    expect((await director.get(`/api/contracts/${contractId}`)).status).toBe(200);
    expect((await director.patch(`/api/contracts/${contractId}`).send({ title: 'x' })).status).toBe(403);
    expect((await finance.get('/api/contracts')).status).toBe(200);
  });

  describe('sales orders under a contract', () => {
    let orderId: string;

    it('copy the quotation lines and start pending', async () => {
      const res = await sA1.post('/api/sales-orders').send({ contractId, deliveryDate: '2099-01-15' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.total).toBe('10000');
      expect(res.body.data.contract.id).toBe(contractId);
      orderId = res.body.data.id;
    });

    it('cannot be invoiced until confirmed, and a contract with orders cannot be cancelled', async () => {
      expect((await finance.post('/api/invoices').send({ salesOrderId: orderId })).status).toBe(422);
      expect((await sA1.post(`/api/contracts/${contractId}/cancel`).send({ reason: 'Customer withdrew' })).status).toBe(422);
    });

    it('confirm with a credit warning when the limit would be exceeded', async () => {
      await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '5000', onHold: false }).expect(200);
      const res = await sA1.post(`/api/sales-orders/${orderId}/confirm`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.warnings[0]).toMatch(/Credit limit exceeded/);
    });

    it('are invoiced once, and the quotation can then not be invoiced directly (no double billing)', async () => {
      const inv = await finance.post('/api/invoices').send({ salesOrderId: orderId });
      expect(inv.status).toBe(201);
      expect(inv.body.data.total).toBe('10000');
      expect(inv.body.data.salesOrder.id).toBe(orderId);
      expect((await finance.post('/api/invoices').send({ salesOrderId: orderId })).status).toBe(422);
      const contract = (await sA1.get(`/api/contracts/${contractId}`)).body.data;
      expect((await finance.post('/api/invoices').send({ quotationId: contract.quotation.id })).status).toBe(422);
      // An invoiced order cannot be cancelled.
      expect((await sA1.post(`/api/sales-orders/${orderId}/cancel`).send({ reason: 'x y z' })).status).toBe(422);
    });

    it('move to delivered, and edits are only allowed while pending', async () => {
      expect((await sA1.patch(`/api/sales-orders/${orderId}`).send({ notes: 'late change' })).status).toBe(422);
      const res = await sA1.post(`/api/sales-orders/${orderId}/deliver`).send({});
      expect(res.body.data.status).toBe('DELIVERED');
      expect(await prisma.auditLog.count({ where: { entityId: orderId, action: { startsWith: 'sales_order.' } } })).toBe(3);
    });
  });
});

describe('sales orders', () => {
  it('are blocked on confirm when credit policy is set to block and the customer is on hold', async () => {
    const order = (await sA1.post('/api/sales-orders').send({ customerId, items: [{ productId, description: 'Cat6 cable', quantity: 2, unitPrice: '195.00' }] })).body.data;
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '1000000', onHold: true }).expect(200);
    await prisma.systemSetting.update({ where: { key: 'credit.blockOnExceed' }, data: { value: true } });
    const res = await sA1.post(`/api/sales-orders/${order.id}/confirm`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/credit hold/);
    await prisma.systemSetting.update({ where: { key: 'credit.blockOnExceed' }, data: { value: false } });
    await finance.put(`/api/credit/${customerId}`).send({ creditLimit: '1000000', onHold: false }).expect(200);
  });

  it('cannot be created from a quotation that was already invoiced directly', async () => {
    const q = await acceptedQuotation([item(300)]);
    await finance.post('/api/invoices').send({ quotationId: q.id }).expect(201);
    expect((await sA1.post('/api/sales-orders').send({ quotationId: q.id })).status).toBe(422);
  });

  it('are scoped: other salespeople and other teams cannot see or change them', async () => {
    const order = (await sA1.post('/api/sales-orders').send({ customerId, items: [item(50)] })).body.data;
    expect((await sA2.get(`/api/sales-orders/${order.id}`)).status).toBe(404);
    expect((await mB.post(`/api/sales-orders/${order.id}/confirm`).send({})).status).toBe(404);
    expect((await mA.get(`/api/sales-orders/${order.id}`)).status).toBe(200);
    expect((await finance.get(`/api/sales-orders/${order.id}`)).status).toBe(200);
    expect((await finance.post(`/api/sales-orders/${order.id}/confirm`).send({})).status).toBe(403);
    expect((await admin.get('/api/sales-orders')).status).toBe(403);
  });

  it('accept KPay as a payment method', async () => {
    const inv = (await finance.post('/api/invoices').send({ customerId, items: [item(80)] })).body.data;
    await finance.post(`/api/invoices/${inv.id}/issue`).send({}).expect(200);
    const res = await finance.post('/api/payments').send({ invoiceId: inv.id, amount: '80', method: 'KPAY', paidAt: new Date().toISOString().slice(0, 10), reference: 'KPAY-123' });
    expect(res.status).toBe(201);
    expect(res.body.data.method).toBe('KPAY');
  });
});
