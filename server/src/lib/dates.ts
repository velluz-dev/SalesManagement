/** Business time zone for calendar dates (due dates, overdue checks, defaults). Override with BUSINESS_TIMEZONE. */
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Yangon';

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Today's calendar date in the business time zone, as UTC midnight (the representation used for DATE columns).
 * Using the UTC date instead would still be "yesterday" in Myanmar between 00:00 and 06:30.
 */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(`${dayFormatter.format(now)}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function periodBounds(type: 'MONTH' | 'QUARTER' | 'YEAR', year: number, index: number) {
  if (type === 'YEAR') return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
  if (type === 'QUARTER') {
    const m = (index - 1) * 3;
    return { start: new Date(Date.UTC(year, m, 1)), end: new Date(Date.UTC(year, m + 3, 0)) };
  }
  return { start: new Date(Date.UTC(year, index - 1, 1)), end: new Date(Date.UTC(year, index, 0)) };
}

export function endOfDay(d: Date): Date {
  return new Date(d.getTime() + 86_400_000 - 1);
}
