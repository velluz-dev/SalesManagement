import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type DecimalLike = Prisma.Decimal | number | string;

export interface LineInput {
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  discountPercent?: DecimalLike;
  taxRate?: DecimalLike;
}

export interface Totals {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, D.ROUND_HALF_UP);

/** Per-line amounts. Each line is rounded to cents so that sum(lines) == document totals. */
export function calculateLine(line: LineInput) {
  const gross = round2(new D(line.quantity).mul(line.unitPrice));
  const discount = round2(gross.mul(line.discountPercent ?? 0).div(100));
  const net = gross.sub(discount);
  const tax = round2(net.mul(line.taxRate ?? 0).div(100));
  return { gross, discount, net, tax, total: net.add(tax) };
}

/**
 * Single source of truth for document totals (quotations and invoices).
 * subtotal = Σ gross, discountTotal = Σ discount, taxTotal = Σ tax, total = subtotal − discount + tax.
 */
export function calculateTotals(lines: LineInput[]): Totals {
  let subtotal = new D(0);
  let discountTotal = new D(0);
  let taxTotal = new D(0);
  for (const l of lines) {
    const c = calculateLine(l);
    subtotal = subtotal.add(c.gross);
    discountTotal = discountTotal.add(c.discount);
    taxTotal = taxTotal.add(c.tax);
  }
  return { subtotal, discountTotal, taxTotal, total: subtotal.sub(discountTotal).add(taxTotal) };
}

export const dec = (v: DecimalLike) => new D(v);
export const ZERO = new D(0);
