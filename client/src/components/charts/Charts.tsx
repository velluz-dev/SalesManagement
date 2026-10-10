import { useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { money } from '../../lib/format';

/** Validated categorical order (see index.css); text always uses ink tokens, never series colors. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
const AXIS = { fontSize: 12, fill: '#64748b' };
const GRID = '#eef2f6';

export interface SeriesDef {
  key: string;
  label: string;
  /** Formatter for values (default: compact money). */
  format?: (v: number) => string;
}

const compact = (v: number) => money(v, { compact: true });

interface TooltipContentProps {
  active?: boolean;
  label?: unknown;
  payload?: { dataKey?: unknown; value?: unknown; color?: string }[];
}

function ChartTooltip({ active, payload, label, series, labelFormat }: TooltipContentProps & { series: SeriesDef[]; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-900">{labelFormat ? labelFormat(String(label)) : String(label)}</p>
      {payload.map((p) => {
        const def = series.find((s) => s.key === p.dataKey);
        return (
          <p key={String(p.dataKey)} className="flex items-center gap-2 text-slate-600">
            <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            {def?.label}: <span className="tabular font-medium text-slate-900">{(def?.format ?? ((v: number) => money(v)))(Number(p.value))}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Wraps a chart with a "view as table" toggle so the data is never available only visually. */
export function ChartFrame<T extends Record<string, unknown>>({
  rows,
  xKey,
  xLabel,
  series,
  xFormat,
  height = 260,
  children,
}: {
  rows: T[];
  xKey: keyof T & string;
  xLabel: string;
  series: SeriesDef[];
  xFormat?: (v: string) => string;
  height?: number;
  children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setTable((t) => !t)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-pressed={table}
        >
          {table ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {table ? 'View chart' : 'View as table'}
        </button>
      </div>
      {table ? (
        <div className="overflow-x-auto" style={{ maxHeight: height }}>
          <table className="table-base w-full">
            <thead>
              <tr>
                <th>{xLabel}</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{xFormat ? xFormat(String(r[xKey])) : String(r[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="tabular text-right">{(s.format ?? ((v: number) => money(v)))(Number(r[s.key]))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} by ${xLabel}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Vertical bars: one series = no legend (the card title names it); 2+ series = grouped with legend. */
export function BarsChart<T extends Record<string, unknown>>({
  rows,
  xKey,
  xLabel,
  series,
  xFormat,
  height,
}: {
  rows: T[];
  xKey: keyof T & string;
  xLabel: string;
  series: SeriesDef[];
  xFormat?: (v: string) => string;
  height?: number;
}) {
  const data = rows.map((r) => ({ ...r, ...Object.fromEntries(series.map((s) => [s.key, Number(r[s.key])])) }));
  const yFormat = series[0]?.format ?? compact;
  return (
    <ChartFrame rows={rows} xKey={xKey} xLabel={xLabel} series={series} xFormat={xFormat} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey as never} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={xFormat} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => yFormat(Number(v))} width={64} />
          <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={<ChartTooltip series={series} labelFormat={xFormat} />} />
          {series.length > 1 && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: '#475569' }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Horizontal bars for ranked categories with long labels (single series). */
export function HBarsChart<T extends Record<string, unknown>>({
  rows,
  yKey,
  yLabel,
  series,
  yFormat,
  height,
}: {
  rows: T[];
  yKey: keyof T & string;
  yLabel: string;
  series: SeriesDef;
  yFormat?: (v: string) => string;
  height?: number;
}) {
  const data = rows.map((r) => ({ ...r, [series.key]: Number(r[series.key]) }));
  const fmt = series.format ?? compact;
  return (
    <ChartFrame rows={rows} xKey={yKey} xLabel={yLabel} series={[series]} xFormat={yFormat} height={height ?? Math.max(160, rows.length * 34 + 24)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v))} />
          <YAxis type="category" dataKey={yKey as never} tick={AXIS} tickLine={false} axisLine={false} width={120} tickFormatter={yFormat} />
          <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={<ChartTooltip series={[series]} labelFormat={yFormat} />} />
          <Bar dataKey={series.key} name={series.label} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
