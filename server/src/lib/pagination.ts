import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export function listQuery<const T extends readonly [string, ...string[]]>(sortFields: T) {
  return paginationQuery.extend({ sort: z.enum(sortFields).default(sortFields[0]) });
}

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paged<T>(data: T[], total: number, q: { page: number; pageSize: number }) {
  return {
    data,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

export const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

export function sortBy(field: string, order: 'asc' | 'desc', nullable: readonly string[] = []) {
  return { [field]: nullable.includes(field) ? { sort: order, nulls: 'last' as const } : order };
}
