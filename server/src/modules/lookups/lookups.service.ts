import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { contains } from '../../lib/pagination';
import { customerScope } from '../customers/customers.service';
import { opportunityScope } from '../opportunities/opportunities.service';
import { searchQuery } from './lookups.validation';

type SearchQuery = z.infer<typeof searchQuery>;

export async function lookupUsers(actor: Actor, { q }: SearchQuery) {
  const seesAll = actor.permissions.has('user.read') || [...actor.permissions].some((p) => p.endsWith('.read.all'));
  return prisma.user.findMany({
    where: {
      isActive: true,
      ...(seesAll ? {} : { id: { in: actor.teamMemberIds } }),
      ...(q ? { OR: [{ name: contains(q) }, { email: contains(q) }] } : {}),
    },
    select: { id: true, name: true, email: true, teamId: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

export async function lookupCustomers(actor: Actor, { q }: SearchQuery) {
  const where: Prisma.CustomerWhereInput = { AND: [customerScope(actor), { isActive: true }, q ? { name: contains(q) } : {}] };
  return prisma.customer.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 });
}

export async function lookupOpportunities(actor: Actor, { q, customerId }: SearchQuery) {
  const where: Prisma.OpportunityWhereInput = {
    AND: [
      opportunityScope(actor),
      { stage: { notIn: ['CLOSED_LOST'] } },
      customerId ? { customerId } : {},
      q ? { name: contains(q) } : {},
    ],
  };
  return prisma.opportunity.findMany({
    where,
    select: { id: true, name: true, customerId: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

export async function lookupTeams(actor: Actor) {
  const seesAll = actor.permissions.has('team.manage') || actor.permissions.has('target.read.all');
  return prisma.team.findMany({
    where: seesAll ? {} : { id: { in: actor.managedTeamIds } },
    select: { id: true, name: true, managerId: true },
    orderBy: { name: 'asc' },
  });
}
