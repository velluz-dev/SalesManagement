import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveScope, DEFAULT_ROLE_PERMISSIONS } from '@crm/shared';
import { calculateLine, calculateTotals } from '../../src/lib/money';
import { isSelfApproval, selectRule } from '../../src/modules/approvals/approval-engine';
import { deriveInvoiceState } from '../../src/modules/invoices/invoices.service';
import { periodBounds } from '../../src/lib/dates';

const D = (v: number | string) => new Prisma.Decimal(v);

describe('calculateTotals', () => {
  it('sums gross, discount and tax per line', () => {
    const t = calculateTotals([
      { quantity: 2, unitPrice: '100.00', discountPercent: 10, taxRate: 7 },
      { quantity: 1, unitPrice: '50.00' },
    ]);
    expect(t.subtotal.toFixed(2)).toBe('250.00');
    expect(t.discountTotal.toFixed(2)).toBe('20.00');
    expect(t.taxTotal.toFixed(2)).toBe('12.60'); // 7% of 180
    expect(t.total.toFixed(2)).toBe('242.60');
  });

  it('rounds each line half-up to cents so lines always sum to the document total', () => {
    const line = calculateLine({ quantity: '3', unitPrice: '0.335', discountPercent: 0, taxRate: 0 });
    expect(line.gross.toFixed(2)).toBe('1.01'); // 1.005 → 1.01
    const t = calculateTotals([{ quantity: 1, unitPrice: '10.005' }, { quantity: 1, unitPrice: '10.005' }]);
    expect(t.total.toFixed(2)).toBe('20.02');
  });

  it('avoids floating-point drift', () => {
    const t = calculateTotals([{ quantity: 3, unitPrice: '0.10' }]);
    expect(t.total.toString()).toBe('0.3');
  });
});

describe('selectRule', () => {
  const rules = [
    { id: 'std', minAmount: D(0), maxAmount: D(50000), priority: 0, isActive: true },
    { id: 'high', minAmount: D(50000), maxAmount: null, priority: 0, isActive: true },
    { id: 'off', minAmount: D(0), maxAmount: null, priority: 99, isActive: false },
  ];
  it('picks the range that contains the amount (min inclusive, max exclusive)', () => {
    expect(selectRule(rules, D(49999.99))?.id).toBe('std');
    expect(selectRule(rules, D(50000))?.id).toBe('high');
    expect(selectRule(rules, D(0))?.id).toBe('std');
  });
  it('ignores inactive rules and prefers higher priority on overlap', () => {
    const overlap = [...rules, { id: 'vip', minAmount: D(10000), maxAmount: D(20000), priority: 5, isActive: true }];
    expect(selectRule(overlap, D(15000))?.id).toBe('vip');
  });
  it('returns undefined when no rule matches', () => {
    expect(selectRule([rules[0]!], D(60000))).toBeUndefined();
  });
});

describe('isSelfApproval', () => {
  it('flags the requester or the owner', () => {
    expect(isSelfApproval('a', 'a', 'b')).toBe(true);
    expect(isSelfApproval('b', 'a', 'b')).toBe(true);
    expect(isSelfApproval('c', 'a', 'b')).toBe(false);
  });
});

describe('resolveScope', () => {
  it('returns the widest granted scope', () => {
    expect(resolveScope(['lead.read.own', 'lead.read.team'], 'lead')).toBe('team');
    expect(resolveScope(['lead.read.all'], 'lead')).toBe('all');
    expect(resolveScope(['customer.read.own'], 'lead')).toBeNull();
    expect(resolveScope(['report.sales.team'], 'report.sales')).toBe('team');
  });
});

describe('default role matrix', () => {
  it('never gives the administrator business approval or financial authority', () => {
    const admin = DEFAULT_ROLE_PERMISSIONS.SYSTEM_ADMIN.permissions as string[];
    for (const p of ['approval.decide', 'invoice.create', 'payment.create', 'quotation.update', 'customer.read.all']) {
      expect(admin).not.toContain(p);
    }
  });
  it('keeps finance away from quotation editing and approvals', () => {
    const fin = DEFAULT_ROLE_PERMISSIONS.FINANCE_OFFICER.permissions as string[];
    expect(fin).not.toContain('quotation.update');
    expect(fin).not.toContain('approval.decide');
  });
});

describe('deriveInvoiceState', () => {
  const today = new Date('2026-06-15T00:00:00Z');
  it('derives balance and overdue for open invoices', () => {
    const s = deriveInvoiceState({ status: 'PARTIALLY_PAID', total: D(1000), amountPaid: D(400), dueDate: new Date('2026-06-01T00:00:00Z') }, today);
    expect(s).toEqual({ balance: '600.00', isOverdue: true, daysOverdue: 14 });
  });
  it('is never overdue when paid, cancelled or draft', () => {
    for (const status of ['PAID', 'CANCELLED', 'DRAFT']) {
      expect(deriveInvoiceState({ status, total: D(10), amountPaid: D(0), dueDate: new Date('2020-01-01') }, today).isOverdue).toBe(false);
    }
  });
});

describe('periodBounds', () => {
  it('computes month, quarter and year boundaries', () => {
    expect(periodBounds('MONTH', 2026, 2).end.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(periodBounds('QUARTER', 2026, 4).start.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(periodBounds('YEAR', 2026, 1).end.toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});
