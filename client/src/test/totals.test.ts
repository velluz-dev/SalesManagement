import { describe, expect, it } from 'vitest';
import { documentTotals, lineTotals } from '../lib/totals';
import { money } from '../lib/format';

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

describe('Myanmar Kyat formatting', () => {
  it('shows whole kyat with the code after the amount', () => {
    expect(money('125000000')).toBe('125,000,000 MMK');
    expect(money(2_500_000, { compact: true })).toBe('2.5M MMK');
  });
});
