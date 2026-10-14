import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { translate } from '../../i18n';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-slate-500', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} style={style} aria-hidden />;
}

function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{translate('Loading…')}</span>
      {children}
    </div>
  );
}

function HeaderSkeleton({ back = false, actions = 1 }: { back?: boolean; actions?: number }) {
  return (
    <div className="mb-6">
      {back && <Skeleton className="mb-3 h-4 w-24" />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-56 sm:w-72" />
          <Skeleton className="h-4 w-64 sm:w-96" />
        </div>
        {actions > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CardSkeleton({ rows = 4, className, children }: { rows?: number; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('card p-5', className)}>
      <Skeleton className="mb-5 h-4 w-32" />
      {children ?? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Loading className={cn('divide-y divide-slate-100', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </Loading>
  );
}

export function DetailPageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton back actions={2} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <CardSkeleton rows={6} />
          <CardSkeleton>
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          </CardSkeleton>
        </div>
        <div className="space-y-6">
          <CardSkeleton rows={4} />
          <CardSkeleton>
            <ListSkeleton rows={3} />
          </CardSkeleton>
        </div>
      </div>
    </Loading>
  );
}

export function ListPageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton actions={1} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3.5">
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function FormPageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton back actions={0} />
      <div className="card space-y-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
    </Loading>
  );
}

export function SettingsPageSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <Loading>
      <HeaderSkeleton actions={0} />
      <div className="space-y-6">
        {Array.from({ length: sections }, (_, s) => (
          <div key={s} className="card space-y-4 p-5">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function ReportSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <Loading className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="card space-y-3 p-5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <Skeleton className="mb-6 h-4 w-40" />
          <div className="flex h-56 items-end gap-3">
            {[40, 65, 30, 80, 55, 90, 45, 70].map((h, i) => <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />)}
          </div>
        </div>
        <div className="card space-y-4 p-5 lg:col-span-2">
          <Skeleton className="mb-2 h-4 w-32" />
          {[90, 70, 55, 40, 25].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <Skeleton className="mb-5 h-4 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
    </Loading>
  );
}

export function PageSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton actions={1} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
    </Loading>
  );
}

export function AppShellSkeleton() {
  return (
    <Loading className="flex min-h-screen bg-[#f5f6fa]">
      <div className="hidden w-[228px] shrink-0 flex-col gap-3 bg-navy-900 p-4 lg:flex">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="size-9 animate-pulse rounded-xl bg-white/10" />
          <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        </div>
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.06]" />)}
      </div>
      <div className="flex-1 p-4 sm:p-6">
        <Skeleton className="mb-8 h-10 w-full max-w-md rounded-xl" />
        <PageSkeleton />
      </div>
    </Loading>
  );
}
