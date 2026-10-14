import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { empty, money, monthLabel, todayIso } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader, StatCard, Tabs } from '../../components/ui/Layout';
import { ErrorState } from '../../components/ui/EmptyState';
import { ReportSkeleton, Skeleton } from '../../components/ui/Spinner';
import { BarsChart, HBarsChart } from '../../components/charts/Charts';

interface SalesReport {
  scope: 'own' | 'team' | 'all';
  bySalesperson: {
    ownerId: string; name: string; wonAmount: string; wonCount: number; lostCount: number; winRate: number | null;
    openAmount: string; openCount: number; quotations: number; quotationsApproved: number; quotationsRejected: number; quotationsAccepted: number;
  }[];
  monthly: { month: string; won: string; count: number }[];
  pipeline: { stage: string; count: number; amount: string }[];
  forecast: {
    months: ({ month: string } & ForecastBucket)[];
    later: ForecastBucket;
    pastDue: ForecastBucket;
    noDate: ForecastBucket;
  };
}

type ForecastBucket = {
  amount: string;
  weighted: string;
  count: number;
};

interface FinanceReport {
  totals: { invoiced: string; collected: string; outstanding: string; overdue: string };
  monthly: { month: string; invoiced: string; collected: string }[];
  aging: { bucket: string; amount: string }[];
  paymentMethods: { method: string; count: number; amount: string }[];
  topDebtors: { customerId: string; name: string; outstanding: string; overdue: string }[];
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function defaultRange() {
  const today = todayIso();
  const [y, m] = today.split('-').map(Number);
  const from = new Date(Date.UTC(y!, m! - 1 - 11, 1)).toISOString().slice(0, 10);
  return { from, to: today };
}

function SalesTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'sales', range],
    queryFn: async () => (await api.get<{ data: SalesReport }>('/reports/sales', range)).data,
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <ReportSkeleton />;
  const won = data.bySalesperson.reduce((s, r) => s + Number(r.wonAmount), 0);
  const wonCount = data.bySalesperson.reduce((s, r) => s + r.wonCount, 0);
  const lost = data.bySalesperson.reduce((s, r) => s + r.lostCount, 0);
  const open = data.bySalesperson.reduce((s, r) => s + Number(r.openAmount), 0);
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">{translate("Scope:")} <strong>{data.scope === 'all' ? 'Company-wide' : data.scope === 'team' ? 'Your team' : 'Your own records'}</strong></p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Won revenue" value={money(won, { compact: true })} sub={`${wonCount} deals`} />
        <StatCard label="Win rate" value={`${wonCount + lost ? Math.round((wonCount / (wonCount + lost)) * 100) : 0}%`} sub={`${wonCount} won, ${lost} lost`} />
        <StatCard label="Open pipeline" value={money(open, { compact: true })} />
        <StatCard label="Quotations issued" value={data.bySalesperson.reduce((s, r) => s + r.quotations, 0)} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title={translate("Won revenue by month")} className="xl:col-span-2">
          <BarsChart rows={data.monthly} xKey="month" xLabel="Month" xFormat={monthLabel} series={[{ key: 'won', label: 'Won' }]} />
        </Card>
        <Card title={translate("Pipeline by stage")}>
          <HBarsChart rows={data.pipeline} yKey="stage" yLabel="Stage" yFormat={enumLabel} series={{ key: 'amount', label: 'Value' }} />
        </Card>
      </div>
      <Card title={translate("Pipeline forecast")} description="Open deals by expected close month. Weighted value applies each deal's win probability.">
        <BarsChart
          rows={data.forecast.months}
          xKey="month"
          xLabel="Month"
          xFormat={monthLabel}
          series={[{ key: 'amount', label: 'Pipeline' }, { key: 'weighted', label: 'Weighted' }]}
        />
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          {[
            { label: 'Past expected close date', bucket: data.forecast.pastDue, tone: 'text-rose-600' },
            { label: 'Closing later', bucket: data.forecast.later, tone: 'text-slate-900' },
            { label: 'No close date set', bucket: data.forecast.noDate, tone: 'text-amber-600' },
          ].map((b) => (
            <div key={b.label} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <dt className="text-xs text-slate-500">{translate(b.label)}</dt>
              <dd className={`tabular mt-0.5 text-sm font-semibold ${b.tone}`}>
                {money(b.bucket.amount, { compact: true })}
                <span className="ml-1.5 text-xs font-normal text-slate-400">{translate('{count} deals', { count: b.bucket.count })}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card
        title={translate("Performance by salesperson")}
        bodyClassName="p-0"
        actions={<Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`sales-report-${range.from}-${range.to}.csv`, data.bySalesperson)}>{translate("Export CSV")}</Button>}
      >
        <div className="relative overflow-x-auto">
          <table className="table-base w-full min-w-[760px]">
            <thead>
              <tr>
                <th>{translate("Salesperson")}</th><th className="text-right">{translate("Won")}</th><th className="text-right">{translate("Deals")}</th><th className="text-right">{translate("Win rate")}</th>
                <th className="text-right">{translate("Open pipeline")}</th><th className="text-right">{translate("Quotes")}</th><th className="text-right">{translate("Approved")}</th><th className="text-right">{translate("Rejected")}</th><th className="text-right">{translate("Accepted")}</th>
              </tr>
            </thead>
            <tbody>
              {data.bySalesperson.map((r) => (
                <tr key={r.ownerId}>
                  <td className="font-medium">{r.name}</td>
                  <td className="tabular text-right">{money(r.wonAmount)}</td>
                  <td className="tabular text-right">{r.wonCount}</td>
                  <td className="tabular text-right">{`${r.winRate ?? 0}%`}</td>
                  <td className="tabular text-right">{money(r.openAmount)}</td>
                  <td className="tabular text-right">{r.quotations}</td>
                  <td className="tabular text-right">{r.quotationsApproved}</td>
                  <td className="tabular text-right">{r.quotationsRejected}</td>
                  <td className="tabular text-right">{r.quotationsAccepted}</td>
                </tr>
              ))}
              {!data.bySalesperson.length && <tr><td colSpan={9} className="py-8 text-center text-slate-500">{translate("No data for this period.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FinanceTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'finance', range],
    queryFn: async () => (await api.get<{ data: FinanceReport }>('/reports/finance', range)).data,
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <ReportSkeleton />;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoiced (period)" value={money(t.invoiced, { compact: true })} />
        <StatCard label="Collected (period)" value={money(t.collected, { compact: true })} />
        <StatCard label="Outstanding (now)" value={money(t.outstanding, { compact: true })} />
        <StatCard label="Overdue (now)" value={money(t.overdue, { compact: true })} />
      </div>
      <Card title={translate("Invoiced vs collected by month")}>
        <BarsChart rows={data.monthly} xKey="month" xLabel="Month" xFormat={monthLabel} series={[{ key: 'invoiced', label: 'Invoiced' }, { key: 'collected', label: 'Collected' }]} height={300} />
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={translate("Receivables aging")}><HBarsChart rows={data.aging} yKey="bucket" yLabel="Days past due" series={{ key: 'amount', label: 'Outstanding' }} /></Card>
        <Card title={translate("Collections by payment method")}>
          <HBarsChart rows={data.paymentMethods} yKey="method" yLabel="Method" yFormat={enumLabel} series={{ key: 'amount', label: 'Collected' }} />
        </Card>
      </div>
      <Card
        title={translate("Top outstanding customers")}
        bodyClassName="p-0"
        actions={<Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`receivables-${range.to}.csv`, data.topDebtors)}>{translate("Export CSV")}</Button>}
      >
        <table className="table-base w-full">
          <thead><tr><th>{translate("Customer")}</th><th className="text-right">{translate("Outstanding")}</th><th className="text-right">{translate("Overdue")}</th></tr></thead>
          <tbody>
            {data.topDebtors.map((d) => (
              <tr key={d.customerId}>
                <td className="font-medium">{d.name}</td>
                <td className="tabular text-right">{money(d.outstanding)}</td>
                <td className={`tabular text-right ${Number(d.overdue) > 0 ? 'font-medium text-rose-600' : ''}`}>{money(d.overdue)}</td>
              </tr>
            ))}
            {!data.topDebtors.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">{translate("No outstanding receivables.")}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  const { canAny, can } = useAuth();
  const hasSales = canAny('report.sales.own', 'report.sales.team', 'report.sales.all');
  const hasFinance = can('report.finance');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') === 'finance' ? 'finance' : 'sales';
  const tab: 'sales' | 'finance' = requested === 'finance' ? (hasFinance ? 'finance' : 'sales') : hasSales ? 'sales' : 'finance';
  const setTab = (t: 'sales' | 'finance') => setParams({ tab: t }, { replace: true });
  const [range, setRange] = useState(defaultRange);

  return (
    <div>
      <PageHeader
        title={translate("Reports")}
        description="Performance and financial reporting for your authorized scope."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-slate-600">{translate("From")} <input type="date" className="h-10 rounded-lg border border-slate-300 bg-white px-2" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></label>
            <label className="flex items-center gap-1.5 text-slate-600">{translate("To")} <input type="date" className="h-10 rounded-lg border border-slate-300 bg-white px-2" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></label>
          </div>
        }
      />
      {hasSales && hasFinance && (
        <div className="mb-6">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Sales performance' }, { value: 'finance', label: 'Financial' }]} />
        </div>
      )}
      {tab === 'sales' && hasSales ? <SalesTab range={range} /> : hasFinance ? <FinanceTab range={range} /> : null}
    </div>
  );
}
