import { describe, expect, it } from 'vitest';
import { documentTotals, lineTotals } from '../lib/totals';

describe('client totals preview (mirrors server rounding)', () => {
  it('matches the server example', () => {
    const t = documentTotals([
      { quantity: 2, unitPrice: '100.00', discountPercent: 10, taxRate: 7 },
      { quantity: 1, unitPrice: '50.00' },
    ]);
    expect(t).toEqual({ subtotal: 250, discountTotal: 20, taxTotal: 12.6, total: 242.6 });
  });
  it('rounds each line to cents and tolerates empty input', () => {
    expect(lineTotals({ quantity: 3, unitPrice: '0.10' }).total).toBe(30);
    expect(lineTotals({ quantity: '', unitPrice: '' }).total).toBe(0);
  });
});
