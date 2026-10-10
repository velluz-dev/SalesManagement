import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EMPTY } from '../../lib/format';

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm',
        size === 'lg' ? 'size-10' : 'size-9',
      )}
    >
      <TrendingUp className={size === 'lg' ? 'size-6' : 'size-5'} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-slate-900">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1.5 max-w-3xl text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <div>
            {title && <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export type StatTone = 'brand' | 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'teal';

const STAT_TONES: Record<StatTone, string> = {
  brand: 'bg-brand-600',
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  slate: 'bg-slate-500',
  teal: 'bg-teal-600',
};

/** KPI tile: solid icon square, label, value, and an optional period-over-period change. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'brand',
  change,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** Percentage change vs the previous period; omitted when there is no comparable data. */
  change?: { value: number; label: string } | null;
}) {
  return (
    <div className="card flex min-w-0 items-start gap-4 p-5">
      {Icon && (
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm', STAT_TONES[tone])}>
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-600">{label}</p>
        <p className="tabular mt-1.5 truncate text-2xl leading-tight font-semibold tracking-tight text-slate-900">{value}</p>
        {change ? (
          <p className="mt-1.5 text-xs text-slate-500">
            <span className={cn('tabular mr-1 inline-flex items-center gap-0.5 font-semibold', change.value >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              <span aria-hidden>{change.value >= 0 ? '▲' : '▼'}</span>
              <span className="sr-only">{change.value >= 0 ? 'Up' : 'Down'}</span>
              {Math.abs(change.value).toFixed(1)}%
            </span>
            {change.label}
          </p>
        ) : (
          sub && <p className="mt-1.5 truncate text-xs text-slate-500">{sub}</p>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = value >= 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-brand-500' : value >= 30 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' };
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols[columns])}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-slate-500">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-slate-900">{i.value ?? EMPTY}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
      />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
    >
      <option value="">{label}: {allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular ml-1.5 rounded bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}
