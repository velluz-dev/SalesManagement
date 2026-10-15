import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { ownerWhere, type Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { contains, pageArgs, paged, sortBy } from '../../lib/pagination';
import { ownerSelect, resolveOwnerId } from '../../lib/ownership';
import { endOfDay, startOfTodayUtc } from '../../lib/dates';
import { customerScope } from '../customers/customers.service';
import { convertLeadSchema, createLeadSchema, listLeadsQuery, updateLeadSchema } from './leads.validation';

const leadScope = (actor: Actor): Prisma.LeadWhereInput => ownerWhere(actor, 'lead');

export function followUpWhere(kind: 'due' | 'overdue', now: Date = new Date()): Prisma.LeadWhereInput {
  const cutoff = kind === 'overdue' ? now : endOfDay(startOfTodayUtc(now));
  return { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] }, nextFollowUpAt: { lte: cutoff } };
}

export async function listLeads(actor: Actor, q: z.infer<typeof listLeadsQuery>) {
  const where: Prisma.LeadWhereInput = {
    AND: [
      leadScope(actor),
      q.q ? { OR: [{ title: contains(q.q) }, { contactName: contains(q.q) }, { company: contains(q.q) }, { email: contains(q.q) }] } : {},
      q.status ? { status: q.status } : {},
      q.source ? { source: q.source } : {},
      q.followUp ? followUpWhere(q.followUp) : {},
      q.ownerId ? { ownerId: q.ownerId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, include: { owner: ownerSelect }, orderBy: sortBy(q.sort, q.order, ['estimatedValue', 'nextFollowUpAt']), ...pageArgs(q) }),
    prisma.lead.count({ where }),
  ]);
  return paged(rows, total, q);
}

export async function getLead(actor: Actor, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, ...leadScope(actor) },
    include: {
      owner: ownerSelect,
      convertedCustomer: { select: { id: true, name: true } },
      opportunities: { select: { id: true, name: true, stage: true, amount: true } },
    },
  });
  if (!lead) throw notFound('Lead');
  return lead;
}

export async function createLead(actor: Actor, input: z.infer<typeof createLeadSchema>) {
  return prisma.$transaction(async (tx) => {
    const ownerId = await resolveOwnerId(tx, actor, input.ownerId);
    const lead = await tx.lead.create({ data: { ...input, ownerId }, include: { owner: ownerSelect } });
    await audit(tx, actor, { action: 'lead.created', entityType: 'Lead', entityId: lead.id, after: lead });
    if (ownerId !== actor.user.id) {
      await notify(tx, [ownerId], {
        type: 'LEAD_ASSIGNED',
        title: 'New lead assigned',
        message: `${actor.user.name} assigned you the lead "${lead.title}"`,
        link: `/leads/${lead.id}`,
      });
    }
    return lead;
  });
}

export async function updateLead(actor: Actor, id: string, input: z.infer<typeof updateLeadSchema>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.lead.findFirst({ where: { id, ...leadScope(actor) } });
    if (!before) throw notFound('Lead');
    if (before.status === 'CONVERTED') throw unprocessable('Converted leads cannot be modified');
    const { ownerId, ...data } = input;
    const newOwner = ownerId && ownerId !== before.ownerId ? await resolveOwnerId(tx, actor, ownerId) : undefined;
    const lead = await tx.lead.update({
      where: { id },
      data: { ...data, ...(newOwner ? { ownerId: newOwner } : {}) },
      include: { owner: ownerSelect },
    });
    await audit(tx, actor, { action: 'lead.updated', entityType: 'Lead', entityId: id, before, after: lead });
    if (newOwner && newOwner !== actor.user.id) {
      await notify(tx, [newOwner], {
        type: 'LEAD_ASSIGNED',
        title: 'Lead re-assigned to you',
        message: `${actor.user.name} assigned you the lead "${lead.title}"`,
        link: `/leads/${lead.id}`,
      });
    }
    return lead;
  });
}

export async function convertLead(actor: Actor, id: string, input: z.infer<typeof convertLeadSchema>) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id, ...leadScope(actor) } });
    if (!lead) throw notFound('Lead');
    if (lead.status === 'CONVERTED') throw unprocessable('This lead has already been converted');
    if (lead.status === 'UNQUALIFIED') throw unprocessable('Unqualified leads cannot be converted');

    let customerId: string;
    if (input.customerId) {
      const existing = await tx.customer.findFirst({ where: { id: input.customerId, ...customerScope(actor) } });
      if (!existing) throw badRequest('Customer not found or not accessible');
      customerId = existing.id;
    } else {
      if (!actor.permissions.has('customer.create')) throw badRequest('You are not allowed to create customers');
      const c = await tx.customer.create({ data: { ...input.customer!, ownerId: lead.ownerId } });
      await audit(tx, actor, { action: 'customer.created', entityType: 'Customer', entityId: c.id, after: c });
      customerId = c.id;
    }

    let opportunityId: string | undefined;
    if (input.opportunity) {
      const o = await tx.opportunity.create({
        data: {
          name: input.opportunity.name,
          amount: input.opportunity.amount,
          expectedCloseDate: input.opportunity.expectedCloseDate,
          customerId,
          leadId: lead.id,
          ownerId: lead.ownerId,
          stage: 'QUALIFICATION',
          probability: 20,
        },
      });
      await audit(tx, actor, { action: 'opportunity.created', entityType: 'Opportunity', entityId: o.id, after: o });
      opportunityId = o.id;
    }

    const updated = await tx.lead.update({
      where: { id },
      data: { status: 'CONVERTED', convertedAt: new Date(), convertedCustomerId: customerId, nextFollowUpAt: null },
    });
    await audit(tx, actor, { action: 'lead.converted', entityType: 'Lead', entityId: id, before: lead, after: updated });
    return { lead: updated, customerId, opportunityId };
  });
}
