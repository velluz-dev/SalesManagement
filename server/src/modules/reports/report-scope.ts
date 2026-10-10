import { resolveScope } from '../../shared';
import { Prisma } from '../../lib/prisma';
import type { AuthContext } from '../../lib/auth-context';
import { forbidden } from '../../lib/errors';

export function reportOwners(actor: AuthContext): string[] | null {
  const scope = resolveScope(actor.permissions, 'report.sales');
  if (!scope) throw forbidden();
  if (scope === 'all') return null;
  return scope === 'team' ? actor.teamMemberIds : [actor.user.id];
}

type OwnerColumn = 'ownerId' | 'salespersonId';

export function ownerSql(owners: string[] | null, column: OwnerColumn) {
  return owners ? Prisma.sql`AND ${Prisma.raw(`"${column}"`)} = ANY(${owners}::uuid[])` : Prisma.empty;
}

export const ownerIn = (owners: string[] | null, field = 'ownerId') => (owners ? { [field]: { in: owners } } : {});

export function monthsBack(n: number) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), 1));
}

export function fillMonths<T extends Record<string, unknown>>(rows: (T & { month: string })[], from: Date, count: number, empty: Omit<T, 'month'>) {
  const map = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    return map.get(m) ?? ({ month: m, ...empty } as T & { month: string });
  });
}
