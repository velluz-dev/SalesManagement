import { enumLabel } from '@crm/shared';

let currency = 'USD';
export const setCurrency = (c: string) => {
  currency = c;
};

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function moneyFormatter(cur: string, compact: boolean) {
  const key = `${cur}|${compact}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export function money(v: string | number | null | undefined, opts: { compact?: boolean; currency?: string } = {}) {
  if (v === null || v === undefined || v === '') return '—';
  return moneyFormatter(opts.currency ?? currency, !!opts.compact).format(Number(v));
}

export function number(v: number | string | null | undefined) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat().format(Number(v));
}

export function date(v: string | Date | null | undefined) {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  // Date-only values come as UTC midnight; format in UTC to avoid off-by-one.
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function relativeTime(v: string | Date) {
  const diff = (new Date(v).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date(v);
}

export const label = (v: string | null | undefined) => (v ? enumLabel(v) : '—');

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
}
