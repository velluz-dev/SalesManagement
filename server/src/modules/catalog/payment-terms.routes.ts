import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';
import { booleanQuery, idParams, requiredText } from '../../lib/validation';

/** Reusable payment terms (Net 30, COD, ...). Everyone can read them; finance (`credit.manage`) maintains them. */
export const paymentTermsRouter = Router();

const termSchema = z.strictObject({
  name: requiredText(40, 'Name'),
  days: z.coerce.number().int().min(0, '0–365 days').max(365, '0–365 days'),
  isActive: z.boolean().default(true),
});

paymentTermsRouter.get('/', async (req, res) => {
  const actor = getActor(req);
  const { all } = z.object({ all: booleanQuery }).parse(req.query);
  const includeInactive = all && actor.permissions.has('credit.manage');
  const terms = await prisma.paymentTerm.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { _count: { select: { customers: true } } },
    orderBy: [{ days: 'asc' }, { name: 'asc' }],
  });
  res.json({ data: terms.map(({ _count, ...t }) => ({ ...t, customerCount: _count.customers })) });
});

paymentTermsRouter.post('/', requirePermission('credit.manage'), async (req, res) => {
  const actor = getActor(req);
  const input = termSchema.parse(req.body);
  const term = await prisma.$transaction(async (tx) => {
    const t = await tx.paymentTerm.create({ data: input });
    await audit(tx, actor, { action: 'payment_term.created', entityType: 'PaymentTerm', entityId: t.id, after: t });
    return t;
  });
  res.status(201).json({ data: term });
});

paymentTermsRouter.patch('/:id', requirePermission('credit.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = termSchema.partial().parse(req.body);
  const term = await prisma.$transaction(async (tx) => {
    const before = await tx.paymentTerm.findUnique({ where: { id } });
    if (!before) throw notFound('Payment term');
    const t = await tx.paymentTerm.update({ where: { id }, data: input });
    await audit(tx, actor, { action: 'payment_term.updated', entityType: 'PaymentTerm', entityId: id, before, after: t });
    return t;
  });
  res.json({ data: term });
});

paymentTermsRouter.delete('/:id', requirePermission('credit.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  await prisma.$transaction(async (tx) => {
    const before = await tx.paymentTerm.findUnique({ where: { id }, include: { _count: { select: { customers: true, invoices: true } } } });
    if (!before) throw notFound('Payment term');
    if (before._count.customers || before._count.invoices) {
      throw conflict('This term is in use by customers or invoices. Deactivate it instead.');
    }
    await tx.paymentTerm.delete({ where: { id } });
    await audit(tx, actor, { action: 'payment_term.deleted', entityType: 'PaymentTerm', entityId: id, before });
  });
  res.status(204).end();
});
