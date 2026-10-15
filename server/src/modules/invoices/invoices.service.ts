import { z } from 'zod';
import { prisma, Prisma, type Db } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { calculateLine, calculateTotals, ZERO } from '../../lib/money';
import { assertSellableProducts, copyLines, normalizeLines, type LineInput } from '../../lib/line-items';
import { contains, pageArgs, paged, sortBy } from '../../lib/pagination';
import { getSettings } from '../../lib/settings';
import { addDays, daysBetween, startOfTodayUtc } from '../../lib/dates';
import { ownerSelect } from '../../lib/ownership';
import { createInvoiceSchema, issueInvoiceSchema, listInvoicesQuery, updateInvoiceSchema } from './invoices.validation';

export function deriveInvoiceState(inv: { status: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; dueDate: Date | null }, today = startOfTodayUtc()) {
  const balance = inv.status === 'CANCELLED' || inv.status === 'DRAFT' ? ZERO : inv.total.sub(inv.amountPaid);
  const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID';
  const isOverdue = open && !!inv.dueDate && inv.dueDate < today;
  return { balance: balance.toFixed(2), isOverdue, daysOverdue: isOverdue ? daysBetween(inv.dueDate!, today) : 0 };
}

export const overdueWhere = (): Prisma.InvoiceWhereInput => ({
  status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
  dueDate: { lt: startOfTodayUtc() },
});

const listInclude = {
  customer: { select: { id: true, name: true } },
  salesperson: ownerSelect,
} satisfies Prisma.InvoiceInclude;

export async function listInvoices(q: z.infer<typeof listInvoicesQuery>) {
  const where: Prisma.InvoiceWhereInput = {
    AND: [
      q.q ? { OR: [{ number: contains(q.q) }, { customer: { name: contains(q.q) } }] } : {},
      q.status ? { status: q.status } : {},
      q.customerId ? { customerId: q.customerId } : {},
      q.overdue ? overdueWhere() : {},
      q.unpaid ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } : {},
      q.from ? { issueDate: { gte: q.from } } : {},
      q.to ? { issueDate: { lte: q.to } } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, include: listInclude, orderBy: sortBy(q.sort, q.order, ['dueDate', 'issueDate']), ...pageArgs(q) }),
    prisma.invoice.count({ where }),
  ]);
  return paged(rows.map((r) => ({ ...r, ...deriveInvoiceState(r) })), total, q);
}

export async function getInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      ...listInclude,
      customer: { select: { id: true, name: true, email: true, address: true, taxId: true, credit: true, paymentTerm: { select: { id: true, name: true, days: true } } } },
      quotation: { select: { id: true, number: true, version: true } },
      salesOrder: { select: { id: true, number: true } },
      paymentTerm: { select: { id: true, name: true, days: true } },
      createdBy: ownerSelect,
      items: { orderBy: { position: 'asc' }, include: { product: { select: { id: true, code: true, unit: true } } } },
      payments: { orderBy: { paidAt: 'desc' }, include: { recordedBy: ownerSelect, voidedBy: ownerSelect } },
    },
  });
  if (!inv) throw notFound('Invoice');
  return {
    ...inv,
    ...deriveInvoiceState(inv),
    items: inv.items.map((i) => ({ ...i, lineTotal: calculateLine(i).total.toFixed(2) })),
  };
}

async function writeInvoiceItems(tx: Prisma.TransactionClient, invoiceId: string, items: LineInput[], defaultTaxRate: number) {
  const normalized = normalizeLines(items, defaultTaxRate);
  await tx.invoiceItem.deleteMany({ where: { invoiceId } });
  await tx.invoiceItem.createMany({ data: normalized.map((i) => ({ ...i, invoiceId })) });
  const totals = calculateTotals(normalized);
  await tx.invoice.update({ where: { id: invoiceId }, data: totals });
  return totals;
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
  return `INV-${new Date().getUTCFullYear()}-${String(row!.n).padStart(5, '0')}`;
}

export async function createInvoice(actor: Actor, input: z.infer<typeof createInvoiceSchema>) {
  const id = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    if ('quotationId' in input) {
      await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${input.quotationId}::uuid FOR UPDATE`;
      const q = await tx.quotation.findUnique({ where: { id: input.quotationId }, include: { items: { orderBy: { position: 'asc' } } } });
      if (!q) throw notFound('Quotation');
      if (q.status !== 'ACCEPTED' && q.status !== 'APPROVED') {
        throw unprocessable('Only approved or accepted quotations can be invoiced');
      }
      const existing = await tx.invoice.findFirst({ where: { quotationId: q.id, status: { not: 'CANCELLED' } } });
      if (existing) throw unprocessable(`Quotation already invoiced as ${existing.number}`);
      const order = await tx.salesOrder.findFirst({ where: { quotationId: q.id, status: { not: 'CANCELLED' } } });
      if (order) throw unprocessable(`This quotation is fulfilled through sales order ${order.number}; invoice the order instead`);
      const inv = await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(tx),
          customerId: q.customerId,
          quotationId: q.id,
          salespersonId: q.ownerId,
          paymentTermId: q.paymentTermId,
          currency: q.currency,
          notes: input.notes ?? q.notes,
          createdById: actor.user.id,
        },
      });
      await writeInvoiceItems(
        tx,
        inv.id,
        copyLines(q.items),
        0,
      );
      await audit(tx, actor, { action: 'invoice.created', entityType: 'Invoice', entityId: inv.id, after: { ...inv, fromQuotation: q.number } });
      return inv.id;
    }

    if ('salesOrderId' in input) {
      await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${input.salesOrderId}::uuid FOR UPDATE`;
      const o = await tx.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { items: { orderBy: { position: 'asc' } } } });
      if (!o) throw notFound('Sales order');
      if (o.status !== 'CONFIRMED' && o.status !== 'DELIVERED') throw unprocessable('Only confirmed or delivered orders can be invoiced');
      const existing = await tx.invoice.findFirst({ where: { salesOrderId: o.id, status: { not: 'CANCELLED' } } });
      if (existing) throw unprocessable(`Order already invoiced as ${existing.number}`);
      const inv = await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(tx),
          customerId: o.customerId,
          salesOrderId: o.id,
          salespersonId: o.ownerId,
          paymentTermId: o.paymentTermId,
          currency: o.currency,
          notes: input.notes ?? o.notes,
          createdById: actor.user.id,
        },
      });
      await writeInvoiceItems(tx, inv.id, copyLines(o.items), 0);
      await audit(tx, actor, { action: 'invoice.created', entityType: 'Invoice', entityId: inv.id, after: { ...inv, fromSalesOrder: o.number } });
      return inv.id;
    }

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw badRequest('Customer not found');
    if (input.salespersonId) {
      const sp = await tx.user.findUnique({ where: { id: input.salespersonId } });
      if (!sp) throw badRequest('Salesperson not found');
    }
    const inv = await tx.invoice.create({
      data: {
        number: await nextInvoiceNumber(tx),
        customerId: customer.id,
        salespersonId: input.salespersonId ?? customer.ownerId,
        paymentTermId: customer.paymentTermId,
        currency: settings['company.currency'],
        notes: input.notes ?? null,
        createdById: actor.user.id,
      },
    });
    await assertSellableProducts(tx, input.items);
    await writeInvoiceItems(tx, inv.id, input.items, settings['quotation.defaultTaxRate']);
    await audit(tx, actor, { action: 'invoice.created', entityType: 'Invoice', entityId: inv.id, after: { ...inv, items: input.items } });
    return inv.id;
  });
  return getInvoice(id);
}

async function lockInvoice(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
  const inv = await tx.invoice.findUnique({ where: { id } });
  if (!inv) throw notFound('Invoice');
  return inv;
}

export async function updateInvoice(actor: Actor, id: string, input: z.infer<typeof updateInvoiceSchema>) {
  await prisma.$transaction(async (tx) => {
    const before = await lockInvoice(tx, id);
    if (before.status !== 'DRAFT') throw unprocessable('Only draft invoices can be edited');
    if (before.quotationId && input.items) throw unprocessable('Line items of an invoice created from a quotation cannot be changed');
    if (input.notes !== undefined) await tx.invoice.update({ where: { id }, data: { notes: input.notes } });
    if (input.items) {
      const settings = await getSettings(tx);
      await writeInvoiceItems(tx, id, input.items, settings['quotation.defaultTaxRate']);
    }
    const after = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await audit(tx, actor, { action: 'invoice.updated', entityType: 'Invoice', entityId: id, before, after });
  });
  return getInvoice(id);
}

export async function customerExposure(db: Db, customerId: string) {
  const r = await db.invoice.aggregate({
    _sum: { total: true, amountPaid: true },
    where: { customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
  });
  return (r._sum.total ?? ZERO).sub(r._sum.amountPaid ?? ZERO);
}

export async function issueInvoice(actor: Actor, id: string, input: z.infer<typeof issueInvoiceSchema>) {
  const warnings: string[] = [];
  await prisma.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, id);
    if (inv.status !== 'DRAFT') throw unprocessable('Only draft invoices can be issued');
    if (inv.total.lte(0)) throw unprocessable('Invoice total must be greater than zero');
    const settings = await getSettings(tx);
    const credit = await tx.customerCredit.findUnique({ where: { customerId: inv.customerId } });
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: inv.customerId }, include: { paymentTerm: true } });

    if (credit) {
      const exposure = await customerExposure(tx, inv.customerId);
      if (credit.onHold) warnings.push('Customer is on credit hold');
      if (exposure.add(inv.total).gt(credit.creditLimit)) {
        warnings.push(`Credit limit exceeded: exposure would be ${exposure.add(inv.total).toFixed(2)} against a limit of ${credit.creditLimit.toFixed(2)}`);
      }
      if (warnings.length && settings['credit.blockOnExceed']) {
        throw unprocessable(`Invoice blocked by credit policy: ${warnings.join('; ')}`, { warnings });
      }
    }

    const issueDate = input.issueDate ?? startOfTodayUtc();
    const agreed = inv.paymentTermId ? await tx.paymentTerm.findUnique({ where: { id: inv.paymentTermId } }) : null;
    const term = agreed ?? customer.paymentTerm;
    const terms = term?.days ?? settings['invoice.defaultPaymentTermsDays'];
    const dueDate = input.dueDate ?? addDays(issueDate, terms);
    if (dueDate < issueDate) throw badRequest('Due date cannot be before the issue date');
    await tx.invoice.update({ where: { id }, data: { status: 'ISSUED', issueDate, dueDate, paymentTermId: term?.id ?? null } });
    await audit(tx, actor, {
      action: 'invoice.issued',
      entityType: 'Invoice',
      entityId: id,
      before: { status: 'DRAFT' },
      after: { status: 'ISSUED', issueDate, dueDate, creditWarnings: warnings },
    });
  });
  return { ...(await getInvoice(id)), warnings };
}

export async function cancelInvoice(actor: Actor, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, id);
    if (inv.status !== 'DRAFT' && inv.status !== 'ISSUED') throw unprocessable('Only draft or unpaid issued invoices can be cancelled');
    if (inv.amountPaid.gt(0)) throw unprocessable('Void all payments before cancelling this invoice');
    await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, actor, { action: 'invoice.cancelled', entityType: 'Invoice', entityId: id, before: { status: inv.status }, after: { status: 'CANCELLED', reason } });
  });
  return getInvoice(id);
}
