import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Skeleton } from './Spinner';
import { EmptyState, ErrorState } from './EmptyState';
import type { Paged } from '../../lib/api';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  hideOnMobile?: boolean;
}

export interface SortState {
  sort?: string;
  order?: 'asc' | 'desc';
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  sort,
  onSort,
  onRowClick,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  caption?: string;
}) {
  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const [primary, ...secondary] = mobileColumns;
  const labelled = secondary.filter((c) => typeof c.header === 'string');
  const trailing = secondary.filter((c) => typeof c.header !== 'string');

  return (
    <div>
      <ul className="divide-y divide-slate-100 md:hidden" aria-label={caption}>
        {loading && !rows
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2 px-4 py-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))
          : primary &&
            rows?.map((row) => (
              <li
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-slate-50')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">{primary.cell(row)}</div>
                  {trailing.length > 0 && <div className="flex shrink-0 items-center gap-1">{trailing.map((c) => <div key={c.key}>{c.cell(row)}</div>)}</div>}
                </div>
                {labelled.length > 0 && (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                    {labelled.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-xs text-slate-500">{c.header}</dt>
                        <dd className="mt-0.5 truncate text-sm text-slate-900">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
      </ul>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="table-base w-full min-w-[640px] border-collapse">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.sort === c.sortKey;
                const ariaSort = active ? (sort?.order === 'asc' ? 'ascending' : 'descending') : undefined;
                return (
                  <th key={c.key} scope="col" aria-sort={ariaSort} className={cn(alignClass(c.align), c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                    {c.sortKey && onSort ? (
                      <button
                        type="button"
                        className={cn('inline-flex items-center gap-1 hover:text-slate-800', active && 'text-slate-800')}
                        onClick={() => onSort({ sort: c.sortKey, order: active && sort?.order === 'desc' ? 'asc' : 'desc' })}
                      >
                        {c.header}
                        {active ? (sort?.order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn(c.hideOnMobile && 'hidden md:table-cell')}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('bg-white', onRowClick && 'cursor-pointer hover:bg-brand-50/50')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn(alignClass(c.align), c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="No records found" description="Try adjusting your search or filters." />)}
      {loading && rows && <div className="h-0.5 animate-pulse bg-brand-200" aria-hidden />}
    </div>
  );
}

export function Pagination({ meta, onPage, onPageSize }: { meta?: Paged<unknown>['meta']; onPage: (p: number) => void; onPageSize?: (s: number) => void }) {
  if (!meta) return null;
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <div className="flex items-center gap-3">
        <span className="tabular">
          {from} to {to} of {meta.total}
        </span>
        {onPageSize && (
          <label className="hidden items-center gap-2 sm:flex">
            <span className="sr-only">Rows per page</span>
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm"
              value={meta.pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((s) => (
                <option key={s} value={s}>{s} per page</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => onPage(meta.page - 1)}
          disabled={meta.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular px-2">
          Page {meta.page} of {meta.totalPages}
        </span>
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => onPage(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
