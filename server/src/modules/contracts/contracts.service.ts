import { z } from 'zod';
import { CONTRACT_STATUSES } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged, sortBy } from '../../lib/pagination';
import { dateOnly, optionalText, requiredText, uuid } from '../../lib/validation';
import { startOfTodayUtc } from '../../lib/dates';
import { ownerSelect } from '../../lib/ownership';
import { quotationScope } from '../quotations/quotations.service';

export const listContractsQuery = listQuery(['createdAt', 'startDate', 'endDate', 'value', 'number'] as const).extend({
  status: z.enum(CONTRACT_STATUSES).optional(),
  customerId: uuid.optional(),
  ownerId: uuid.optional(),
});

const documentUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Use a full http:// or https:// link')
  .transform((v) => (v === '' ? null : v))
  .optional()
  .nullable();

export const createContractSchema = z
  .strictObject({
    quotationId: uuid,
    title: optionalText(200),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional().nullable(),
    terms: optionalText(8000),
    documentUrl,
  })
  .refine((v) => !v.endDate || !v.startDate || v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

export const updateContractSchema = z.strictObject({
  title: requiredText(200, 'Title').optional(),
  endDate: dateOnly.optional().nullable(),
  terms: optionalText(8000),
  documentUrl,
});

export const cancelContractSchema = z.strictObject({ reason: requiredText(500, 'Cancellation reason') });

export const contractScope = (actor: Actor): Prisma.ContractWhereInput => ownerWhere(actor, 'contract');

const include = {
  customer: { select: { id: true, name: true } },
  owner: ownerSelect,
} satisfies Prisma.ContractInclude;

export async function listContracts(actor: Actor, q: z.infer<typeof listContractsQuery>) {
  const where: Prisma.ContractWhereInput = {
    AND: [
      contractScope(actor),
      q.q ? { OR: [{ number: contains(q.q) }, { title: contains(q.q) }, { customer: { name: contains(q.q) } }] } : {},
      q.status ? { status: q.status } : {},
      q.customerId ? { customerId: q.customerId } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.contract.findMany({ where, include, orderBy: sortBy(q.sort, q.order, ['endDate']), ...pageArgs(q) }),
    prisma.contract.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function getContract(actor: Actor, id: string) {
  const c = await prisma.contract.findFirst({
    where: { id, ...contractScope(actor) },
    include: {
      ...include,
      createdBy: ownerSelect,
      paymentTerm: { select: { id: true, name: true, days: true } },
      quotation: { select: { id: true, number: true, version: true, total: true, currency: true } },
      orders: { select: { id: true, number: true, status: true, total: true, orderDate: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!c) throw notFound('Contract');
  return c;
}

async function nextContractNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('contract_number_seq') AS n`;
  return `C-${new Date().getUTCFullYear()}-${String(row!.n).padStart(5, '0')}`;
}

export async function createContract(actor: Actor, input: z.infer<typeof createContractSchema>) {
  const id = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${input.quotationId}::uuid FOR UPDATE`;
    const q = await tx.quotation.findFirst({
      where: { id: input.quotationId, ...quotationScope(actor) },
      include: { customer: { select: { name: true } }, contract: { select: { number: true } } },
    });
    if (!q) throw badRequest('Quotation not found or not accessible');
    if (q.status !== 'ACCEPTED') throw unprocessable('Only quotations the customer has accepted can become contracts');
    if (q.contract) throw unprocessable(`This quotation already has contract ${q.contract.number}`);
    const startDate = input.startDate ?? startOfTodayUtc();
    if (input.endDate && input.endDate < startDate) throw badRequest('End date must be on or after the start date');
    const c = await tx.contract.create({
      data: {
        number: await nextContractNumber(tx),
        quotationId: q.id,
        customerId: q.customerId,
        ownerId: q.ownerId,
        title: input.title ?? `${q.customer.name} – ${q.number}`,
        startDate,
        endDate: input.endDate ?? null,
        value: q.total,
        currency: q.currency,
        terms: input.terms ?? q.terms,
        paymentTermId: q.paymentTermId,
        documentUrl: input.documentUrl ?? null,
        createdById: actor.user.id,
      },
    });
    await audit(tx, actor, { action: 'contract.created', entityType: 'Contract', entityId: c.id, after: { ...c, fromQuotation: q.number } });
    return c.id;
  });
  return getContract(actor, id);
}

async function lockContract(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const c = await tx.contract.findFirst({ where: { id, ...contractScope(actor) } });
  if (!c) throw notFound('Contract');
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.contract.findUniqueOrThrow({ where: { id } });
}

export async function updateContract(actor: Actor, id: string, input: z.infer<typeof updateContractSchema>) {
  await prisma.$transaction(async (tx) => {
    const before = await lockContract(tx, actor, id);
    if (before.status !== 'ACTIVE') throw unprocessable('Only active contracts can be edited');
    if (input.endDate && input.endDate < before.startDate) throw badRequest('End date must be on or after the start date');
    const c = await tx.contract.update({ where: { id }, data: input });
    await audit(tx, actor, { action: 'contract.updated', entityType: 'Contract', entityId: id, before, after: c });
  });
  return getContract(actor, id);
}

export async function completeContract(actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await lockContract(tx, actor, id);
    if (before.status !== 'ACTIVE') throw unprocessable('Only active contracts can be completed');
    await tx.contract.update({ where: { id }, data: { status: 'COMPLETED' } });
    await audit(tx, actor, { action: 'contract.completed', entityType: 'Contract', entityId: id, before: { status: before.status }, after: { status: 'COMPLETED' } });
  });
  return getContract(actor, id);
}

export async function cancelContract(actor: Actor, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const before = await lockContract(tx, actor, id);
    if (before.status !== 'ACTIVE') throw unprocessable('Only active contracts can be cancelled');
    const openOrders = await tx.salesOrder.count({ where: { contractId: id, status: { not: 'CANCELLED' } } });
    if (openOrders) throw unprocessable('Cancel the sales orders under this contract first');
    await tx.contract.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    await audit(tx, actor, { action: 'contract.cancelled', entityType: 'Contract', entityId: id, before: { status: before.status }, after: { status: 'CANCELLED', reason } });
  });
  return getContract(actor, id);
}
