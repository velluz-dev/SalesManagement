import type { z } from 'zod';
import { EDITABLE_QUOTATION_STATUSES, type QuotationStatus } from '../../shared';
import { prisma, Prisma, type Db } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { calculateLine, calculateTotals } from '../../lib/money';
import { assertSellableProducts, copyLines, normalizeLines, type LineInput } from '../../lib/line-items';
import { contains, pageArgs, paged, sortBy } from '../../lib/pagination';
import { getSettings } from '../../lib/settings';
import { addDays, startOfTodayUtc } from '../../lib/dates';
import { ownerSelect } from '../../lib/ownership';
import { customerScope } from '../customers/customers.service';
import { opportunityScope } from '../opportunities/opportunities.service';
import { resolveApprover } from '../approvals/approval-engine';
import { customerExposure } from '../invoices/invoices.service';
import type { CreateQuotationInput, LineItemInput, listQuotationsQuery, UpdateQuotationInput } from './quotations.validation';

export const quotationScope = (actor: Actor): Prisma.QuotationWhereInput => ownerWhere(actor, 'quotation');

const listInclude = {
  owner: ownerSelect,
  customer: { select: { id: true, name: true } },
} satisfies Prisma.QuotationInclude;

const detailInclude = {
  owner: ownerSelect,
  customer: { select: { id: true, name: true, email: true, address: true } },
  opportunity: { select: { id: true, name: true, stage: true } },
  paymentTerm: { select: { id: true, name: true, days: true } },
  items: { orderBy: { position: 'asc' }, include: { product: { select: { id: true, code: true, name: true, unit: true } } } },
  parent: { select: { id: true, number: true, version: true, status: true } },
  revision: { select: { id: true, number: true, version: true, status: true } },
  invoices: { select: { id: true, number: true, status: true, total: true } },
  contract: { select: { id: true, number: true, status: true } },
  salesOrders: { where: { status: { not: 'CANCELLED' } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' } },
  approvalRequests: {
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: ownerSelect,
      assignedTo: ownerSelect,
      decidedBy: ownerSelect,
      approverRole: { select: { id: true, code: true, name: true } },
      rule: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: 'asc' }, include: { actor: ownerSelect } },
    },
  },
} satisfies Prisma.QuotationInclude;

type QuotationDetail = Prisma.QuotationGetPayload<{ include: typeof detailInclude }>;

function withLineTotals(q: QuotationDetail) {
  return {
    ...q,
    items: q.items.map((i) => {
      const c = calculateLine(i);
      return { ...i, lineSubtotal: c.gross.toFixed(2), lineDiscount: c.discount.toFixed(2), lineTax: c.tax.toFixed(2), lineTotal: c.total.toFixed(2) };
    }),
  };
}

export async function listQuotations(actor: Actor, q: z.infer<typeof listQuotationsQuery>) {
  const where: Prisma.QuotationWhereInput = {
    AND: [
      quotationScope(actor),
      q.q ? { OR: [{ number: contains(q.q) }, { customer: { name: contains(q.q) } }] } : {},
      q.status ? { status: q.status } : q.includeSuperseded ? {} : { status: { not: 'SUPERSEDED' } },
      q.customerId ? { customerId: q.customerId } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
      q.opportunityId ? { opportunityId: q.opportunityId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({ where, include: listInclude, orderBy: sortBy(q.sort, q.order), ...pageArgs(q) }),
    prisma.quotation.count({ where }),
  ]);
  return paged(rows, total, q);
}

const CREDIT_CHECKED_STATUSES: QuotationStatus[] = ['DRAFT', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'SENT'];

export async function creditCheck(db: Db, customerId: string, amount: Prisma.Decimal) {
  const credit = await db.customerCredit.findUnique({ where: { customerId } });
  if (!credit) return null;
  const exposure = await customerExposure(db, customerId);
  const after = exposure.add(amount);
  const warnings: string[] = [];
  if (credit.onHold) warnings.push('Customer is on credit hold');
  if (after.gt(credit.creditLimit)) warnings.push(`Credit limit exceeded: exposure would be ${after.toFixed(2)} against a limit of ${credit.creditLimit.toFixed(2)}`);
  return {
    limit: credit.creditLimit.toFixed(2),
    exposure: exposure.toFixed(2),
    available: Prisma.Decimal.max(credit.creditLimit.sub(exposure), 0).toFixed(2),
    onHold: credit.onHold,
    warnings,
  };
}

export async function getQuotation(actor: Actor, id: string) {
  const q = await prisma.quotation.findFirst({ where: { id, ...quotationScope(actor) }, include: detailInclude });
  if (!q) throw notFound('Quotation');
  const credit = CREDIT_CHECKED_STATUSES.includes(q.status) ? await creditCheck(prisma, q.customerId, q.total) : null;
  return { ...withLineTotals(q), credit };
}

async function assertPaymentTerm(db: Db, paymentTermId: string | null | undefined) {
  if (!paymentTermId) return;
  const term = await db.paymentTerm.findUnique({ where: { id: paymentTermId }, select: { isActive: true } });
  if (!term?.isActive) throw badRequest('Payment term not found or inactive');
}

async function lockQuotation(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const q = await tx.quotation.findFirst({ where: { id, ...quotationScope(actor) } });
  if (!q) throw notFound('Quotation');
  await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.quotation.findUniqueOrThrow({ where: { id } });
}

function assertStatus(current: QuotationStatus, allowed: QuotationStatus[], action: string) {
  if (!allowed.includes(current)) {
    throw unprocessable(`Cannot ${action} a quotation with status ${current.replace('_', ' ').toLowerCase()}`, { status: current, allowed });
  }
}

async function writeItems(tx: Prisma.TransactionClient, quotationId: string, items: LineInput[], defaultTaxRate: number) {
  const normalized = normalizeLines(items, defaultTaxRate);
  await tx.quotationItem.deleteMany({ where: { quotationId } });
  await tx.quotationItem.createMany({ data: normalized.map((i) => ({ ...i, quotationId })) });
  const totals = calculateTotals(normalized);
  await tx.quotation.update({ where: { id: quotationId }, data: totals });
  return totals;
}

async function assertCustomerAndOpportunity(tx: Db, actor: Actor, customerId: string, opportunityId?: string | null) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, ...customerScope(actor) } });
  if (!customer) throw badRequest('Customer not found or not accessible');
  if (opportunityId) {
    const opp = await tx.opportunity.findFirst({ where: { id: opportunityId, ...opportunityScope(actor) } });
    if (!opp) throw badRequest('Opportunity not found or not accessible');
    if (opp.customerId !== customerId) throw badRequest('The opportunity belongs to a different customer');
  }
  return customer;
}

async function nextQuotationNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('quotation_number_seq') AS n`;
  return `Q-${new Date().getUTCFullYear()}-${String(row!.n).padStart(5, '0')}`;
}

export async function createQuotation(actor: Actor, input: CreateQuotationInput) {
  const id = await prisma.$transaction(async (tx) => {
    const customer = await assertCustomerAndOpportunity(tx, actor, input.customerId, input.opportunityId);
    await assertPaymentTerm(tx, input.paymentTermId);
    const settings = await getSettings(tx);
    const today = startOfTodayUtc();
    const q = await tx.quotation.create({
      data: {
        number: await nextQuotationNumber(tx),
        customerId: input.customerId,
        opportunityId: input.opportunityId ?? null,
        ownerId: actor.user.id,
        issueDate: today,
        validUntil: input.validUntil ?? addDays(today, settings['quotation.defaultValidityDays']),
        currency: settings['company.currency'],
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        paymentTermId: input.paymentTermId !== undefined ? input.paymentTermId : customer.paymentTermId,
      },
    });
    await assertSellableProducts(tx, input.items);
    const totals = await writeItems(tx, q.id, input.items, settings['quotation.defaultTaxRate']);
    await audit(tx, actor, { action: 'quotation.created', entityType: 'Quotation', entityId: q.id, after: { ...q, ...totals, items: input.items } });
    return q.id;
  });
  return getQuotation(actor, id);
}

export async function updateQuotation(actor: Actor, id: string, input: UpdateQuotationInput) {
  await prisma.$transaction(async (tx) => {
    const before = await lockQuotation(tx, actor, id);
    assertStatus(before.status, EDITABLE_QUOTATION_STATUSES, 'edit');
    const customerId = input.customerId ?? before.customerId;
    const opportunityId = input.opportunityId !== undefined ? input.opportunityId : before.opportunityId;
    if (input.customerId || input.opportunityId) await assertCustomerAndOpportunity(tx, actor, customerId, opportunityId);
    await assertPaymentTerm(tx, input.paymentTermId);
    await tx.quotation.update({
      where: { id },
      data: {
        customerId,
        opportunityId,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.terms !== undefined ? { terms: input.terms } : {}),
        ...(input.paymentTermId !== undefined ? { paymentTermId: input.paymentTermId } : {}),
      },
    });
    if (input.items) {
      await assertSellableProducts(tx, input.items);
      const settings = await getSettings(tx);
      await writeItems(tx, id, input.items, settings['quotation.defaultTaxRate']);
    }
    const after = await tx.quotation.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await audit(tx, actor, { action: 'quotation.updated', entityType: 'Quotation', entityId: id, before, after });
  });
  return getQuotation(actor, id);
}

export async function submitQuotation(actor: Actor, id: string, comment?: string | null) {
  let warnings: string[] = [];
  await prisma.$transaction(async (tx) => {
    const q = await lockQuotation(tx, actor, id);
    assertStatus(q.status, ['DRAFT', 'REJECTED'], 'submit');
    const itemCount = await tx.quotationItem.count({ where: { quotationId: id } });
    if (!itemCount) throw unprocessable('Add at least one line item before submitting');
    if (q.validUntil < startOfTodayUtc()) throw unprocessable('The validity date is in the past. Update it before submitting.');

    warnings = (await creditCheck(tx, q.customerId, q.total))?.warnings ?? [];
    const assignment = await resolveApprover(tx, { total: q.total, ownerId: q.ownerId, requestedById: actor.user.id });
    const request = await tx.approvalRequest.create({
      data: {
        quotationId: id,
        quotationVersion: q.version,
        amount: q.total,
        requestedById: actor.user.id,
        ruleId: assignment.rule.id,
        approverRoleId: assignment.approverRole.id,
        assignedToId: assignment.assignedToId,
        history: { create: { action: 'SUBMITTED', actorId: actor.user.id, comment: comment ?? null } },
      },
    });
    await tx.quotation.update({ where: { id }, data: { status: 'PENDING_APPROVAL', submittedAt: new Date() } });
    await notify(tx, assignment.eligibleUserIds, {
      type: 'APPROVAL_REQUESTED',
      title: 'Quotation awaiting your approval',
      message: `${q.number} v${q.version} (${q.currency} ${q.total.toFixed(2)}) was submitted by ${actor.user.name}${warnings.length ? `. ${warnings.join('. ')}` : ''}`,
      link: `/approvals/${request.id}`,
    });
    await audit(tx, actor, {
      action: q.status === 'REJECTED' ? 'quotation.resubmitted' : 'quotation.submitted',
      entityType: 'Quotation',
      entityId: id,
      before: { status: q.status },
      after: { status: 'PENDING_APPROVAL', approvalRequestId: request.id, rule: assignment.rule.name, approverRole: assignment.approverRole.code, assignedToId: assignment.assignedToId, creditWarnings: warnings },
    });
  });
  return { ...(await getQuotation(actor, id)), warnings };
}

export async function withdrawQuotation(actor: Actor, id: string, comment?: string | null) {
  await prisma.$transaction(async (tx) => {
    const q = await lockQuotation(tx, actor, id);
    assertStatus(q.status, ['PENDING_APPROVAL'], 'withdraw');
    const request = await tx.approvalRequest.findFirst({ where: { quotationId: id, status: 'PENDING' } });
    if (request) {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED', history: { create: { action: 'CANCELLED', actorId: actor.user.id, comment: comment ?? 'Withdrawn by requester' } } },
      });
    }
    await tx.quotation.update({ where: { id }, data: { status: 'DRAFT' } });
    await audit(tx, actor, { action: 'quotation.withdrawn', entityType: 'Quotation', entityId: id, before: { status: q.status }, after: { status: 'DRAFT' } });
  });
  return getQuotation(actor, id);
}

async function transition(actor: Actor, id: string, from: QuotationStatus[], to: QuotationStatus, action: string, extra: Prisma.QuotationUpdateInput = {}) {
  await prisma.$transaction(async (tx) => {
    const q = await lockQuotation(tx, actor, id);
    assertStatus(q.status, from, action);
    if ((to === 'SENT' || to === 'ACCEPTED') && q.validUntil < startOfTodayUtc()) {
      throw unprocessable(`This offer expired on ${q.validUntil.toISOString().slice(0, 10)}. Revise the quotation to make a new offer.`);
    }
    await tx.quotation.update({ where: { id }, data: { status: to, ...extra } });
    await audit(tx, actor, { action: `quotation.${to.toLowerCase()}`, entityType: 'Quotation', entityId: id, before: { status: q.status }, after: { status: to } });
  });
  return getQuotation(actor, id);
}

export const markSent = (actor: Actor, id: string) => transition(actor, id, ['APPROVED'], 'SENT', 'send', { sentAt: new Date() });

export const recordCustomerResponse = (actor: Actor, id: string, outcome: 'ACCEPTED' | 'DECLINED') =>
  transition(actor, id, ['APPROVED', 'SENT'], outcome, outcome === 'ACCEPTED' ? 'accept' : 'decline');

export const cancelQuotation = (actor: Actor, id: string) => transition(actor, id, ['DRAFT', 'REJECTED'], 'CANCELLED', 'cancel');

export async function reviseQuotation(actor: Actor, id: string, comment?: string | null) {
  const newId = await prisma.$transaction(async (tx) => {
    const q = await lockQuotation(tx, actor, id);
    assertStatus(q.status, ['APPROVED', 'SENT', 'DECLINED', 'EXPIRED'], 'revise');
    const invoiced = await tx.invoice.count({ where: { quotationId: id, status: { not: 'CANCELLED' } } });
    if (invoiced) throw unprocessable('This quotation has been invoiced and cannot be revised');
    const items = await tx.quotationItem.findMany({ where: { quotationId: id }, orderBy: { position: 'asc' } });
    const today = startOfTodayUtc();
    const settings = await getSettings(tx);
    const copy = await tx.quotation.create({
      data: {
        number: q.number,
        version: q.version + 1,
        parentId: q.id,
        customerId: q.customerId,
        opportunityId: q.opportunityId,
        ownerId: q.ownerId,
        issueDate: today,
        validUntil: q.validUntil > today ? q.validUntil : addDays(today, settings['quotation.defaultValidityDays']),
        currency: q.currency,
        notes: q.notes,
        terms: q.terms,
        paymentTermId: q.paymentTermId,
      },
    });
    await writeItems(
      tx,
      copy.id,
      copyLines(items),
      0,
    );
    await tx.quotation.update({ where: { id }, data: { status: 'SUPERSEDED' } });
    const lastApproval = await tx.approvalRequest.findFirst({ where: { quotationId: id }, orderBy: { createdAt: 'desc' } });
    if (lastApproval) {
      await tx.approvalHistory.create({
        data: { approvalRequestId: lastApproval.id, action: 'REVISED', actorId: actor.user.id, comment: comment ?? `Revised as version ${copy.version}` },
      });
    }
    await audit(tx, actor, {
      action: 'quotation.revised',
      entityType: 'Quotation',
      entityId: id,
      before: { status: q.status, version: q.version },
      after: { status: 'SUPERSEDED', newQuotationId: copy.id, newVersion: copy.version, comment },
    });
    return copy.id;
  });
  return getQuotation(actor, newId);
}
