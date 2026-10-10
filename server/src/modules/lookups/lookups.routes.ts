import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { getActor } from '../../lib/auth-context';
import { contains } from '../../lib/pagination';
import { customerScope } from '../customers/customers.service';
import { opportunityScope } from '../opportunities/opportunities.service';
import { forbidden } from '../../lib/errors';
import { uuid } from '../../lib/validation';

/** Lightweight, scope-aware pickers used by forms. Never return more than the actor may see. */
export const lookupsRouter = Router();

const searchQuery = z.object({ q: z.string().trim().max(100).optional(), customerId: uuid.optional() });

/**
 * Users the actor may pick (e.g. as record owner or target assignee):
 * everyone for holders of user.read or any *.read.all scope; otherwise their team (or just themself).
 */
lookupsRouter.get('/users', async (req, res) => {
  const actor = getActor(req);
  const { q } = searchQuery.parse(req.query);
  const seesAll = actor.permissions.has('user.read') || [...actor.permissions].some((p) => p.endsWith('.read.all'));
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(seesAll ? {} : { id: { in: actor.teamMemberIds } }),
      ...(q ? { OR: [{ name: contains(q) }, { email: contains(q) }] } : {}),
    },
    select: { id: true, name: true, email: true, teamId: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  res.json({ data: users });
});

lookupsRouter.get('/customers', async (req, res) => {
  const actor = getActor(req);
  const perms = actor.permissions;
  if (!['customer.read.own', 'customer.read.team', 'customer.read.all'].some((p) => perms.has(p))) throw forbidden();
  const { q } = searchQuery.parse(req.query);
  const where: Prisma.CustomerWhereInput = { AND: [customerScope(actor), { isActive: true }, q ? { name: contains(q) } : {}] };
  res.json({ data: await prisma.customer.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }) });
});

lookupsRouter.get('/opportunities', async (req, res) => {
  const actor = getActor(req);
  if (!['opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'].some((p) => actor.permissions.has(p))) throw forbidden();
  const { q, customerId } = searchQuery.parse(req.query);
  const where: Prisma.OpportunityWhereInput = {
    AND: [
      opportunityScope(actor),
      { stage: { notIn: ['CLOSED_LOST'] } },
      customerId ? { customerId } : {},
      q ? { name: contains(q) } : {},
    ],
  };
  res.json({
    data: await prisma.opportunity.findMany({
      where,
      select: { id: true, name: true, customerId: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  });
});

lookupsRouter.get('/teams', async (req, res) => {
  const actor = getActor(req);
  // Admins and company-wide viewers see every team; managers see the teams they manage.
  const seesAll = actor.permissions.has('team.manage') || actor.permissions.has('target.read.all');
  const teams = await prisma.team.findMany({
    where: seesAll ? {} : { id: { in: actor.managedTeamIds } },
    select: { id: true, name: true, managerId: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data: teams });
});
