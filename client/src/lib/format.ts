import { currentLocale, enumLabel, translate } from '../i18n';

export const EMPTY = '—';

let currency = 'MMK';
export const setCurrency = (c: string) => {
  currency = c;
};

const WHOLE_UNIT = new Set(['MMK', 'JPY']);
const CODE_SUFFIX = new Set(['MMK']);

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(cur: string, compact: boolean) {
  const key = `${cur}|${compact}`;
  let f = formatters.get(key);
  if (!f) {
    const whole = WHOLE_UNIT.has(cur);
    const digits = compact ? { maximumFractionDigits: 1, minimumFractionDigits: 0 } : { maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 };
    f = CODE_SUFFIX.has(cur)
      ? new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', ...digits })
      : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, notation: compact ? 'compact' : 'standard', ...digits });
    formatters.set(key, f);
  }
  return f;
}

export function money(v: string | number | null | undefined, opts: { compact?: boolean; currency?: string } = {}) {
  if (v === null || v === undefined || v === '') return EMPTY;
  const cur = opts.currency ?? currency;
  const text = formatter(cur, !!opts.compact).format(Number(v));
  return CODE_SUFFIX.has(cur) ? `${text} ${cur}` : text;
}

export function number(v: number | string | null | undefined) {
  if (v === null || v === undefined) return EMPTY;
  return new Intl.NumberFormat().format(Number(v));
}

export function date(v: string | Date | null | undefined) {
  if (!v) return EMPTY;
  const d = typeof v === 'string' ? new Date(v) : v;
  return d.toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return EMPTY;
  return new Date(v).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function relativeTime(v: string | Date) {
  const diff = (new Date(v).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date(v);
}

export const label = (v: string | null | undefined) => (v ? enumLabel(v) : EMPTY);

export function toLocalInput(v: string | null | undefined) {
  if (!v) return '';
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const isPast = (v: string | null | undefined) => !!v && new Date(v).getTime() < Date.now();

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(currentLocale(), { month: 'short', timeZone: 'UTC' });
}
