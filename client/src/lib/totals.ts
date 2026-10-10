export interface LineLike {
  quantity: string | number;
  unitPrice: string | number;
  discountPercent?: string | number;
  taxRate?: string | number;
}

const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);

export function lineTotals(l: LineLike) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unitPrice) || 0;
  const gross = toCents(qty * price);
  const discount = Math.round((gross * (Number(l.discountPercent) || 0)) / 100);
  const net = gross - discount;
  const tax = Math.round((net * (Number(l.taxRate) || 0)) / 100);
  return { gross, discount, net, tax, total: net + tax };
}

export function documentTotals(lines: LineLike[]) {
  const t = lines.reduce(
    (acc, l) => {
      const c = lineTotals(l);
      return { subtotal: acc.subtotal + c.gross, discount: acc.discount + c.discount, tax: acc.tax + c.tax };
    },
    { subtotal: 0, discount: 0, tax: 0 },
  );
  return {
    subtotal: t.subtotal / 100,
    discountTotal: t.discount / 100,
    taxTotal: t.tax / 100,
    total: (t.subtotal - t.discount + t.tax) / 100,
  };
}
