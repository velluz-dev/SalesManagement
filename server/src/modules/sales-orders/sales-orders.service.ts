import { z } from 'zod';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { calculateLine, calculateTotals, ZERO } from '../../lib/money';
import { contains, listQuery, pageArgs, paged, sortBy } from '../../lib/pagination';
import { getSettings } from '../../lib/settings';
import { startOfTodayUtc } from '../../lib/dates';
import { dateOnly, optionalText, requiredText, uuid } from '../../lib/validation';
import { ownerSelect } from '../../lib/ownership';
import { assertSellableProducts, copyLines, normalizeLines, type LineInput } from '../../lib/line-items';
import { lineItemSchema } from '../quotations/quotations.schemas';
import { quotationScope } from '../quotations/quotations.service';
import { customerScope } from '../customers/customers.service';
import { contractScope } from '../contracts/contracts.service';
import { customerExposure } from '../invoices/invoices.service';

export const listOrdersQuery = listQuery(['createdAt', 'orderDate', 'deliveryDate', 'total', 'number'] as const).extend({
  status: z.enum(SALES_ORDER_STATUSES).optional(),
  customerId: uuid.optional(),
  contractId: uuid.optional(),
  ownerId: uuid.optional(),
});

const common = {
  orderDate: dateOnly.optional(),
  deliveryDate: dateOnly.optional().nullable(),
  notes: optionalText(4000),
};

export const createOrderSchema = z.union([
  z.strictObject({ contractId: uuid, ...common }),
  z.strictObject({ quotationId: uuid, ...common }),
  z.strictObject({ customerId: uuid, items: z.array(lineItemSchema).min(1, 'Add at least one line item').max(200), ...common }),
]);

export const updateOrderSchema = z.strictObject({
  deliveryDate: dateOnly.optional().nullable(),
  notes: optionalText(4000),
  items: z.array(lineItemSchema).min(1).max(200).optional(),
});

export const cancelOrderSchema = z.strictObject({ reason: requiredText(500, 'Cancellation reason') });
export const deliverOrderSchema = z.strictObject({ deliveryDate: dateOnly.optional() });

export const orderScope = (actor: Actor): Prisma.SalesOrderWhereInput => ownerWhere(actor, 'order');

const listInclude = {
  customer: { select: { id: true, name: true } },
  owner: ownerSelect,
  contract: { select: { id: true, number: true } },
} satisfies Prisma.SalesOrderInclude;

export async function listOrders(actor: Actor, q: z.infer<typeof listOrdersQuery>) {
  const where: Prisma.SalesOrderWhereInput = {
    AND: [
      orderScope(actor),
      q.q ? { OR: [{ number: contains(q.q) }, { customer: { name: contains(q.q) } }] } : {},
      q.status ? { status: q.status } : {},
      q.customerId ? { customerId: q.customerId } : {},
      q.contractId ? { contractId: q.contractId } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({ where, include: listInclude, orderBy: sortBy(q.sort, q.order, ['deliveryDate']), ...pageArgs(q) }),
    prisma.salesOrder.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function getOrder(actor: Actor, id: string) {
  const o = await prisma.salesOrder.findFirst({
    where: { id, ...orderScope(actor) },
    include: {
      ...listInclude,
      paymentTerm: { select: { id: true, name: true, days: true } },
      createdBy: ownerSelect,
      quotation: { select: { id: true, number: true, version: true } },
      items: { orderBy: { position: 'asc' }, include: { product: { select: { id: true, code: true, name: true, unit: true } } } },
      invoices: { select: { id: true, number: true, status: true, total: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!o) throw notFound('Sales order');
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, lineTotal: calculateLine(i).total.toFixed(2) })),
  };
}

async function writeOrderItems(tx: Prisma.TransactionClient, salesOrderId: string, items: LineInput[], defaultTaxRate: number) {
  const normalized = normalizeLines(items, defaultTaxRate);
  await tx.salesOrderItem.deleteMany({ where: { salesOrderId } });
  await tx.salesOrderItem.createMany({ data: normalized.map((i) => ({ ...i, salesOrderId })) });
  const totals = calculateTotals(normalized);
  await tx.salesOrder.update({ where: { id: salesOrderId }, data: totals });
  return totals;
}

async function contractOrdered(tx: Prisma.TransactionClient, contractId: string, excludeOrderId?: string) {
  const r = await tx.salesOrder.aggregate({
    _sum: { total: true },
    where: { contractId, status: { in: ['CONFIRMED', 'DELIVERED'] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
  });
  return r._sum.total ?? ZERO;
}

async function nextOrderNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('sales_order_number_seq') AS n`;
  return `SO-${new Date().getUTCFullYear()}-${String(row!.n).padStart(5, '0')}`;
}

export async function createOrder(actor: Actor, input: z.infer<typeof createOrderSchema>) {
  const id = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    let source: { customerId: string; ownerId: string; contractId: string | null; quotationId: string | null; paymentTermId: string | null; currency: string; lines: LineInput[]; label: string };

    if ('contractId' in input) {
      const c = await tx.contract.findFirst({
        where: { id: input.contractId, ...contractScope(actor) },
        include: { quotation: { include: { items: { orderBy: { position: 'asc' } } } } },
      });
      if (!c) throw badRequest('Contract not found or not accessible');
      if (c.status !== 'ACTIVE') throw unprocessable('Orders can only be created under an active contract');
      const direct = await tx.invoice.findFirst({ where: { quotationId: c.quotationId, status: { not: 'CANCELLED' } } });
      if (direct) throw unprocessable(`The contract's quotation was already invoiced directly as ${direct.number}`);
      if ((await contractOrdered(tx, c.id)).gte(c.value)) throw unprocessable(`The full value of contract ${c.number} has already been ordered`);
      source = { customerId: c.customerId, ownerId: c.ownerId, contractId: c.id, quotationId: c.quotationId, paymentTermId: c.paymentTermId, currency: c.currency, lines: copyLines(c.quotation.items), label: c.number };
    } else if ('quotationId' in input) {
      const q = await tx.quotation.findFirst({
        where: { id: input.quotationId, ...quotationScope(actor) },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      if (!q) throw badRequest('Quotation not found or not accessible');
      if (q.status !== 'ACCEPTED') throw unprocessable('Only quotations the customer has accepted can be ordered');
      const direct = await tx.invoice.findFirst({ where: { quotationId: q.id, status: { not: 'CANCELLED' } } });
      if (direct) throw unprocessable(`This quotation was already invoiced directly as ${direct.number}`);
      const contract = await tx.contract.findUnique({ where: { quotationId: q.id }, select: { number: true, status: true } });
      if (contract && contract.status !== 'CANCELLED') throw unprocessable(`This quotation is under contract ${contract.number}; create orders from the contract`);
      const existing = await tx.salesOrder.findFirst({ where: { quotationId: q.id, contractId: null, status: { not: 'CANCELLED' } } });
      if (existing) throw unprocessable(`This quotation was already ordered as ${existing.number}`);
      source = { customerId: q.customerId, ownerId: q.ownerId, contractId: null, quotationId: q.id, paymentTermId: q.paymentTermId, currency: q.currency, lines: copyLines(q.items), label: q.number };
    } else {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, ...customerScope(actor) } });
      if (!customer) throw badRequest('Customer not found or not accessible');
      await assertSellableProducts(tx, input.items);
      source = { customerId: customer.id, ownerId: actor.user.id, contractId: null, quotationId: null, paymentTermId: customer.paymentTermId, currency: settings['company.currency'], lines: input.items, label: 'manual' };
    }

    const order = await tx.salesOrder.create({
      data: {
        number: await nextOrderNumber(tx),
        customerId: source.customerId,
        ownerId: source.ownerId,
        contractId: source.contractId,
        quotationId: source.quotationId,
        paymentTermId: source.paymentTermId,
        orderDate: input.orderDate ?? startOfTodayUtc(),
        deliveryDate: input.deliveryDate ?? null,
        currency: source.currency,
        notes: input.notes ?? null,
        createdById: actor.user.id,
      },
    });
    const totals = await writeOrderItems(tx, order.id, source.lines, settings['quotation.defaultTaxRate']);
    await audit(tx, actor, { action: 'sales_order.created', entityType: 'SalesOrder', entityId: order.id, after: { ...order, ...totals, from: source.label } });
    return order.id;
  });
  return getOrder(actor, id);
}

async function lockOrder(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const o = await tx.salesOrder.findFirst({ where: { id, ...orderScope(actor) } });
  if (!o) throw notFound('Sales order');
  await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.salesOrder.findUniqueOrThrow({ where: { id } });
}

function assertStatus(current: SalesOrderStatus, allowed: SalesOrderStatus[], action: string) {
  if (!allowed.includes(current)) throw unprocessable(`Cannot ${action} an order that is ${current.toLowerCase()}`, { status: current, allowed });
}

export async function updateOrder(actor: Actor, id: string, input: z.infer<typeof updateOrderSchema>) {
  await prisma.$transaction(async (tx) => {
    const before = await lockOrder(tx, actor, id);
    assertStatus(before.status, ['PENDING'], 'edit');
    await tx.salesOrder.update({
      where: { id },
      data: {
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    if (input.items) {
      await assertSellableProducts(tx, input.items);
      const settings = await getSettings(tx);
      await writeOrderItems(tx, id, input.items, settings['quotation.defaultTaxRate']);
    }
    const after = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await audit(tx, actor, { action: 'sales_order.updated', entityType: 'SalesOrder', entityId: id, before, after });
  });
  return getOrder(actor, id);
}

async function orderExposure(tx: Prisma.TransactionClient, customerId: string, excludeOrderId: string) {
  const invoiced = await customerExposure(tx, customerId);
  const pending = await tx.salesOrder.aggregate({
    _sum: { total: true },
    where: {
      customerId,
      id: { not: excludeOrderId },
      status: { in: ['CONFIRMED', 'DELIVERED'] },
      invoices: { none: { status: { not: 'CANCELLED' } } },
    },
  });
  return invoiced.add(pending._sum.total ?? ZERO);
}

export async function confirmOrder(actor: Actor, id: string) {
  const warnings: string[] = [];
  await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, actor, id);
    assertStatus(o.status, ['PENDING'], 'confirm');
    if (o.total.lte(0)) throw unprocessable('Order total must be greater than zero');
    if (o.contractId) {
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: o.contractId }, select: { number: true, value: true } });
      const ordered = (await contractOrdered(tx, o.contractId, id)).add(o.total);
      if (ordered.gt(contract.value)) {
        throw unprocessable(`Orders under contract ${contract.number} would total ${ordered.toFixed(2)}, more than the contract value of ${contract.value.toFixed(2)}. Reduce the quantities on this order.`);
      }
    }
    const credit = await tx.customerCredit.findUnique({ where: { customerId: o.customerId } });
    if (credit) {
      const exposure = (await orderExposure(tx, o.customerId, id)).add(o.total);
      if (credit.onHold) warnings.push('Customer is on credit hold');
      if (exposure.gt(credit.creditLimit)) {
        warnings.push(`Credit limit exceeded: exposure would be ${exposure.toFixed(2)} against a limit of ${credit.creditLimit.toFixed(2)}`);
      }
      const settings = await getSettings(tx);
      if (warnings.length && settings['credit.blockOnExceed']) {
        throw unprocessable(`Order blocked by credit policy: ${warnings.join('; ')}`, { warnings });
      }
    }
    await tx.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    await audit(tx, actor, { action: 'sales_order.confirmed', entityType: 'SalesOrder', entityId: id, before: { status: o.status }, after: { status: 'CONFIRMED', creditWarnings: warnings } });
  });
  return { ...(await getOrder(actor, id)), warnings };
}

export async function deliverOrder(actor: Actor, id: string, deliveryDate?: Date) {
  await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, actor, id);
    assertStatus(o.status, ['CONFIRMED'], 'deliver');
    const date = deliveryDate ?? startOfTodayUtc();
    if (date < o.orderDate) throw badRequest('Delivery date cannot be before the order date');
    await tx.salesOrder.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveryDate: date } });
    await audit(tx, actor, { action: 'sales_order.delivered', entityType: 'SalesOrder', entityId: id, before: { status: o.status }, after: { status: 'DELIVERED', deliveryDate: date } });
  });
  return getOrder(actor, id);
}

export async function cancelOrder(actor: Actor, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, actor, id);
    assertStatus(o.status, ['PENDING', 'CONFIRMED'], 'cancel');
    const invoiced = await tx.invoice.count({ where: { salesOrderId: id, status: { not: 'CANCELLED' } } });
    if (invoiced) throw unprocessable('Cancel the invoice for this order first');
    await tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, actor, { action: 'sales_order.cancelled', entityType: 'SalesOrder', entityId: id, before: { status: o.status }, after: { status: 'CANCELLED', reason } });
  });
  return getOrder(actor, id);
}
