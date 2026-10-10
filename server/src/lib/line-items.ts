import type { Prisma } from '@prisma/client';
import type { Db } from './prisma';
import { badRequest } from './errors';

/** A document line as accepted from clients (quotations, sales orders, manual invoices). */
export interface LineInput {
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent?: number;
  taxRate?: number;
}

/** Positions lines and applies the default tax rate; the result is what gets stored and totalled. */
export function normalizeLines(items: LineInput[], defaultTaxRate: number) {
  return items.map((i, idx) => ({
    position: idx + 1,
    productId: i.productId ?? null,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discountPercent: i.discountPercent ?? 0,
    taxRate: i.taxRate ?? defaultTaxRate,
  }));
}

/** Converts stored lines (Decimal columns) back into input form, to copy them onto another document. */
export function copyLines(
  items: { productId: string | null; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountPercent: Prisma.Decimal; taxRate: Prisma.Decimal }[],
): LineInput[] {
  return items.map((i) => ({
    productId: i.productId,
    description: i.description,
    quantity: i.quantity.toString(),
    unitPrice: i.unitPrice.toString(),
    discountPercent: i.discountPercent.toNumber(),
    taxRate: i.taxRate.toNumber(),
  }));
}

/**
 * Products referenced by new or edited lines must exist and still be sold. Copies of existing documents
 * (revisions, orders, invoices) skip this so a discontinued product does not block downstream steps.
 */
export async function assertSellableProducts(db: Db, items: LineInput[]) {
  const ids = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
  if (!ids.length) return;
  const found = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, isActive: true } });
  const byId = new Map(found.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) throw badRequest('A line refers to a product that does not exist');
    if (!p.isActive) throw badRequest(`Product ${p.code} is no longer sold`);
  }
}
