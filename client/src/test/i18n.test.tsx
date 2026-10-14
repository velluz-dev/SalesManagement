import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ACTIVITY_TYPES, CONTRACT_STATUSES, CUSTOMER_TYPES, INVOICE_STATUSES, LEAD_SOURCES, LEAD_STATUSES,
  OPPORTUNITY_STAGES, PAYMENT_METHODS, QUOTATION_STATUSES, ROLE_CODES, SALES_ORDER_STATUSES, TARGET_PERIOD_TYPES,
} from '@shared';
import { I18nProvider, enumLabel, translate } from '../i18n';
import { my } from '../i18n/my';
import { LanguageSwitch } from '../components/layout/LanguageSwitch';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';

function Page() {
  return (
    <>
      <LanguageSwitch />
      <Button>Sign in</Button>
      <StatusBadge status="PENDING_APPROVAL" />
      <p>{translate('Welcome back, {name}!', { name: 'Sam' })}</p>
      <p>{translate('Northwind Logistics')}</p>
    </>
  );
}

function Screen() {
  return (
    <I18nProvider>
      <Page />
    </I18nProvider>
  );
}

afterEach(() => {
  try {
    localStorage.setItem('saleshub.lang', 'en');
  } catch {
  }
});

describe('Myanmar language support', () => {
  it('switches the whole screen to Burmese and back, and remembers the choice', () => {
    render(<Screen />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Pending approval')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'မြန်မာ' }));
    expect(screen.getByRole('button', { name: 'အကောင့်ဝင်ရန်' })).toBeInTheDocument();
    expect(screen.getByText('အတည်ပြုရန်စောင့်ဆိုင်း')).toBeInTheDocument();
    expect(screen.getByText('ပြန်လည်ကြိုဆိုပါသည်၊ Sam!')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('my');
    const stored = (() => {
      try {
        return localStorage.getItem('saleshub.lang');
      } catch {
        return 'unavailable';
      }
    })();
    expect(['my', 'unavailable']).toContain(stored);

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('leaves user data and untranslated text unchanged', () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole('button', { name: 'မြန်မာ' }));
    expect(screen.getByText('Northwind Logistics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
  });

  it('has a Burmese name for every status, stage, method, type and role code', () => {
    const codes = [
      ...LEAD_STATUSES, ...LEAD_SOURCES, ...OPPORTUNITY_STAGES, ...ACTIVITY_TYPES, ...QUOTATION_STATUSES,
      ...INVOICE_STATUSES, ...PAYMENT_METHODS, ...TARGET_PERIOD_TYPES, ...CUSTOMER_TYPES, ...CONTRACT_STATUSES,
      ...SALES_ORDER_STATUSES, ...Object.values(ROLE_CODES),
    ];
    const missing = [...new Set(codes)].filter((c) => !my[`enum.${c}`]);
    expect(missing).toEqual([]);
  });

  it('falls back to readable English labels in English', () => {
    expect(enumLabel('CLOSED_WON')).toBe('Closed Won');
  });

  it('keeps placeholders intact in every translation', () => {
    const broken = Object.entries(my).filter(([en, mm]) => {
      const want = (en.match(/\{\w+\}/g) ?? []).sort().join();
      const have = (mm.match(/\{\w+\}/g) ?? []).sort().join();
      return want !== have;
    });
    expect(broken).toEqual([]);
  });
});
