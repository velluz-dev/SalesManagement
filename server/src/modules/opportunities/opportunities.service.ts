import { z } from 'zod';
import { OPPORTUNITY_STAGES } from '../../shared';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged, sortBy } from '../../lib/pagination';
import { dateOnly, money, optionalText, requiredText, uuid } from '../../lib/validation';
import { ownerSelect, resolveOwnerId } from '../../lib/ownership';
import { customerScope } from '../customers/customers.service';

export const listOpportunitiesQuery = listQuery(['createdAt', 'expectedCloseDate', 'amount', 'name', 'updatedAt'] as const).extend({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  customerId: uuid.optional(),
  ownerId: uuid.optional(),
});

export const createOpportunitySchema = z.strictObject({
  name: requiredText(160, 'Name'),
  customerId: uuid,
  stage: z.enum(OPPORTUNITY_STAGES).default('PROSPECTING'),
  amount: money,
  probability: z.coerce.number().int().min(0).max(100).default(10),
  expectedCloseDate: dateOnly.optional().nullable(),
  notes: optionalText(2000),
  ownerId: uuid.optional(),
});
export const updateOpportunitySchema = createOpportunitySchema.partial();

export const opportunityScope = (actor: Actor): Prisma.OpportunityWhereInput => ownerWhere(actor, 'opportunity');

const statusWhere = (s?: 'open' | 'won' | 'lost'): Prisma.OpportunityWhereInput =>
  s === 'won' ? { stage: 'CLOSED_WON' } : s === 'lost' ? { stage: 'CLOSED_LOST' } : s === 'open' ? { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } } : {};

export async function listOpportunities(actor: Actor, q: z.infer<typeof listOpportunitiesQuery>) {
  const where: Prisma.OpportunityWhereInput = {
    AND: [
      opportunityScope(actor),
      q.q ? { OR: [{ name: contains(q.q) }, { customer: { name: contains(q.q) } }] } : {},
      q.stage ? { stage: q.stage } : {},
      statusWhere(q.status),
      q.customerId ? { customerId: q.customerId } : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: { owner: ownerSelect, customer: { select: { id: true, name: true } } },
      orderBy: sortBy(q.sort, q.order, ['expectedCloseDate']),
      ...pageArgs(q),
    }),
    prisma.opportunity.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function pipeline(actor: Actor, ownerId?: string) {
  const where: Prisma.OpportunityWhereInput = { AND: [opportunityScope(actor), ownerId ? { ownerId } : {}] };
  const rows = await prisma.opportunity.findMany({
    where,
    select: {
      id: true, name: true, stage: true, amount: true, probability: true, expectedCloseDate: true,
      customer: { select: { id: true, name: true } }, owner: ownerSelect,
    },
    orderBy: { expectedCloseDate: { sort: 'asc', nulls: 'last' } },
  });
  const stages = OPPORTUNITY_STAGES.map((stage) => {
    const items = rows.filter((r) => r.stage === stage);
    const total = items.reduce((s, r) => s.add(r.amount), new Prisma.Decimal(0));
    const weighted = items.reduce((s, r) => s.add(r.amount.mul(r.probability).div(100)), new Prisma.Decimal(0));
    return { stage, count: items.length, total: total.toFixed(2), weighted: weighted.toFixed(2), items };
  });
  return { stages };
}

export async function getOpportunity(actor: Actor, id: string) {
  const o = await prisma.opportunity.findFirst({
    where: { id, ...opportunityScope(actor) },
    include: {
      owner: ownerSelect,
      customer: { select: { id: true, name: true } },
      lead: { select: { id: true, title: true } },
      quotations: { select: { id: true, number: true, version: true, status: true, total: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!o) throw notFound('Opportunity');
  return o;
}

function closedAtFor(stage: string | undefined, previous: { stage: string; closedAt: Date | null } | null) {
  if (!stage) return undefined;
  const isClosed = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST';
  if (isClosed && previous?.stage !== stage) return new Date();
  if (!isClosed) return null;
  return previous?.closedAt ?? new Date();
}

export async function createOpportunity(actor: Actor, input: z.infer<typeof createOpportunitySchema>) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, ...customerScope(actor) } });
    if (!customer) throw badRequest('Customer not found or not accessible');
    const ownerId = await resolveOwnerId(tx, actor, input.ownerId);
    const o = await tx.opportunity.create({
      data: { ...input, ownerId, closedAt: closedAtFor(input.stage, null) },
      include: { owner: ownerSelect, customer: { select: { id: true, name: true } } },
    });
    await audit(tx, actor, { action: 'opportunity.created', entityType: 'Opportunity', entityId: o.id, after: o });
    return o;
  });
}

export async function updateOpportunity(actor: Actor, id: string, input: z.infer<typeof updateOpportunitySchema>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.opportunity.findFirst({ where: { id, ...opportunityScope(actor) } });
    if (!before) throw notFound('Opportunity');
    if (input.customerId && input.customerId !== before.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, ...customerScope(actor) } });
      if (!customer) throw badRequest('Customer not found or not accessible');
    }
    const { ownerId, ...data } = input;
    const newOwner = ownerId && ownerId !== before.ownerId ? await resolveOwnerId(tx, actor, ownerId) : undefined;
    const o = await tx.opportunity.update({
      where: { id },
      data: {
        ...data,
        ...(newOwner ? { ownerId: newOwner } : {}),
        ...(input.stage ? { closedAt: closedAtFor(input.stage, before) } : {}),
        ...(input.stage === 'CLOSED_WON' && input.probability === undefined ? { probability: 100 } : {}),
        ...(input.stage === 'CLOSED_LOST' && input.probability === undefined ? { probability: 0 } : {}),
      },
      include: { owner: ownerSelect, customer: { select: { id: true, name: true } } },
    });
    await audit(tx, actor, {
      action: before.stage !== o.stage ? 'opportunity.stage_changed' : 'opportunity.updated',
      entityType: 'Opportunity',
      entityId: id,
      before,
      after: o,
    });
    return o;
  });
}
