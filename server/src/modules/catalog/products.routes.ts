import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, listQuery, pageArgs, paged, sortBy } from '../../lib/pagination';
import { booleanQuery, idParams, money, optionalText, requiredText } from '../../lib/validation';

export const productsRouter = Router();
const canRead = requireAnyPermission('product.read', 'product.manage');

const listProductsQuery = listQuery(['name', 'code', 'listPrice', 'createdAt'] as const).extend({
  category: z.string().trim().max(80).optional(),
  isActive: booleanQuery,
});

const productSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'Use 2–40 letters, numbers, dots, dashes or underscores'),
  name: requiredText(160, 'Product name'),
  unit: z.string().trim().min(1, 'Unit is required').max(20).default('unit'),
  category: optionalText(80),
  description: optionalText(1000),
  listPrice: money,
  isActive: z.boolean().default(true),
});

productsRouter.get('/', canRead, async (req, res) => {
  const actor = getActor(req);
  const q = listProductsQuery.parse(req.query);
  // Only catalog managers can browse discontinued products; everyone else sees what can be sold.
  const isActive = actor.permissions.has('product.manage') ? q.isActive : true;
  const where: Prisma.ProductWhereInput = {
    AND: [
      q.q ? { OR: [{ code: contains(q.q) }, { name: contains(q.q) }, { category: contains(q.q) }] } : {},
      q.category ? { category: q.category } : {},
      isActive !== undefined ? { isActive } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: sortBy(q.sort, q.order), ...pageArgs(q) }),
    prisma.product.count({ where }),
  ]);
  res.json(paged(rows, total, q));
});

productsRouter.get('/categories', canRead, async (_req, res) => {
  const rows = await prisma.product.findMany({
    where: { category: { not: null } },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  res.json({ data: rows.map((r) => r.category) });
});

productsRouter.get('/:id', canRead, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound('Product');
  res.json({ data: product });
});

productsRouter.post('/', requirePermission('product.manage'), async (req, res) => {
  const actor = getActor(req);
  const input = productSchema.parse(req.body);
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: input });
    await audit(tx, actor, { action: 'product.created', entityType: 'Product', entityId: p.id, after: p });
    return p;
  });
  res.status(201).json({ data: product });
});

productsRouter.patch('/:id', requirePermission('product.manage'), async (req, res) => {
  const actor = getActor(req);
  const { id } = idParams.parse(req.params);
  const input = productSchema.partial().parse(req.body);
  const product = await prisma.$transaction(async (tx) => {
    const before = await tx.product.findUnique({ where: { id } });
    if (!before) throw notFound('Product');
    const p = await tx.product.update({ where: { id }, data: input });
    await audit(tx, actor, {
      action: before.listPrice.equals(p.listPrice) ? 'product.updated' : 'product.price_changed',
      entityType: 'Product',
      entityId: id,
      before,
      after: p,
    });
    return p;
  });
  res.json({ data: product });
});
