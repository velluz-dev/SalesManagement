import { z } from 'zod';
import { prisma, Prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, pageArgs, paged, sortBy } from '../../lib/pagination';
import { listProductsQuery, productSchema, updateProductSchema } from './products.validation';

export async function listProducts(actor: Actor, q: z.infer<typeof listProductsQuery>) {
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
  return paged(rows, total, q);
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    where: { category: { not: null } },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((r) => r.category);
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound('Product');
  return product;
}

export async function createProduct(actor: Actor, input: z.infer<typeof productSchema>) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: input });
    await audit(tx, actor, { action: 'product.created', entityType: 'Product', entityId: p.id, after: p });
    return p;
  });
}

export async function updateProduct(actor: Actor, id: string, input: z.infer<typeof updateProductSchema>) {
  return prisma.$transaction(async (tx) => {
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
}
