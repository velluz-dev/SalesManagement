import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Bell, CheckCircle2, ChevronDown, CircleAlert, FileText,
  Info, MoreHorizontal, Receipt, Trophy, UserPlus, TrendingUp, CircleDot, Wallet,
} from 'lucide-react';
import { currentLocale, enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { api, type Paged } from '../../lib/api';
import { date, money, monthLabel, relativeTime } from '../../lib/format';
import { Card, StatCard } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ErrorState, EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Spinner';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Notification, Quotation, SalesTarget, UserRef } from '../../lib/types';

interface Dashboard {
  sales: null | {
    activeLeads: number;
    openOpportunities: { count: number; amount: string };
    wonThisMonth: { count: number; amount: string };
    quotationsByStatus: { status: string; count: number; amount: string }[];
    monthlyWon: { month: string; won: string }[];
    wonLastMonth: string;
    dailyPerformance: { day: number; won: string | null; target: string | null }[];
    monthTarget: string;
    myTarget: SalesTarget | null;
    pipeline: { stage: string; count: number; amount: string }[];
    targets: SalesTarget[];
    achievementBasis: string;
  };
  approvals: null | {
    pendingCount: number;
    pendingAmount: string;
    oldest: {
      id: string;
      amount: string;
      createdAt: string;
      requestedBy: UserRef;
      quotation: { id: string; number: string; version: number; currency: string; customer: { name: string } };
    }[];
  };
  finance: null | {
    receivables: { count: number; amount: string };
    overdue: { count: number; amount: string };
    paymentsThisMonth: { count: number; amount: string };
    credit: { totalLimit: string; totalExposure: string; customersOverLimit: number; customersOnHold: number };
    monthly: { month: string; invoiced: string; collected: string }[];
    aging: { bucket: string; amount: string }[];
    overdueInvoices: { id: string; number: string; balance: string; dueDate: string; customer: { name: string } }[];
  };
  admin: null | {
    users: { total: number; active: number; inactive: number };
    roles: { id: string; name: string; code: string; users: number }[];
    activeSessions: number;
    recentActivity: { id: string; action: string; entityType: string; createdAt: string; actor: UserRef | null }[];
    logins: { day: string; success: number; failed: number }[];
  };
}

const FUNNEL_COLORS = ['#4c3fc8', '#5b4fe3', '#6a62ef', '#8180f7', '#a3a8fc'];
const FUNNEL_ORDER = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'];

/* ---------- Sales Performance (area chart like the mock) ---------- */

type PerformancePeriod = 'month' | 'six-months';

const yTick = (v: number) => (v >= 1_000_000_000 ? `${+(v / 1_000_000_000).toFixed(1)}B` : v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(v));

/** Real data only: this month = cumulative won sales per day vs the pace to this month's targets; six months = won per month. */
function PerformanceChart({ sales, period }: { sales: NonNullable<Dashboard['sales']>; period: PerformancePeriod }) {
  const monthName = new Date().toLocaleDateString(currentLocale(), { month: 'short' });
  const hasTarget = period === 'month' && Number(sales.monthTarget) > 0;
  const data =
    period === 'month'
      ? sales.dailyPerformance.map((d) => ({
          x: `${monthName} ${d.day}`,
          sales: d.won === null ? null : Number(d.won),
          target: d.target === null ? null : Number(d.target),
        }))
      : sales.monthlyWon.map((m) => ({ x: monthLabel(m.month), sales: Number(m.won), target: null }));
  if (!data.length) return <EmptyState title={translate("No sales data yet")} />;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-600" aria-hidden /> {translate(period === 'month' ? 'Won this month, cumulative' : 'Won per month')}
        </span>
        {hasTarget && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#1baf7a]" aria-hidden /> {translate('Target pace ({amount} this month)', { amount: money(sales.monthTarget, { compact: true }) })}
          </span>
        )}
        {period === 'month' && !hasTarget && <span className="text-slate-400">{translate("No monthly target set for this period")}</span>}
      </div>
      <div className="h-[240px]" role="img" aria-label={period === 'month' ? 'Cumulative won sales this month versus target pace' : 'Won sales per month, last six months'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="#eef0f6" />
            <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#9aa1b5' }} tickLine={false} axisLine={{ stroke: '#eef0f6' }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: '#9aa1b5' }} tickLine={false} axisLine={false} width={52} tickFormatter={yTick} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #eef0f6', fontSize: 12 }}
              formatter={(value, name) => [money(Number(value)), translate(name === 'sales' ? 'Won' : 'Target pace')]}
            />
            <Area type="monotone" dataKey="sales" stroke="#5b4fe3" strokeWidth={2.2} fill="#5b4fe3" fillOpacity={0.08} dot={period === 'six-months' ? { r: 2.5, fill: '#5b4fe3', strokeWidth: 0 } : false} activeDot={{ r: 4 }} connectNulls={false} />
            {hasTarget && <Area type="linear" dataKey="target" stroke="#1baf7a" strokeWidth={1.8} strokeDasharray="5 4" fill="#1baf7a" fillOpacity={0.05} dot={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Sales Funnel ---------- */

function Funnel({ pipeline }: { pipeline: { stage: string; count: number; amount: string }[] }) {
  // Pipeline order (not sorted by size), every open stage shown even when empty.
  const sorted = FUNNEL_ORDER.map((stage) => pipeline.find((p) => p.stage === stage) ?? { stage, count: 0, amount: '0' });
  if (!sorted.some((p) => p.count)) return <EmptyState title={translate("No open opportunities")} />;
  const top = Math.max(...sorted.map((p) => p.count)) || 1;
  return (
    <ul className="space-y-1.5">
      {sorted.map((p, i) => (
        <li key={p.stage} className="flex items-center gap-3">
          <div className="flex w-[46%] justify-center">
            <div
              className="flex h-[34px] items-center justify-center text-[11px] font-semibold text-white"
              style={{
                // Width is proportional to the stage's count (kept visible when small).
                width: `${Math.max(14, (p.count / top) * 100)}%`,
                background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 12px 100%)',
              }}
              aria-hidden
            />
          </div>
          <span className="w-24 truncate text-xs font-medium text-slate-600">{enumLabel(p.stage)}</span>
          <span className="tabular w-8 text-right text-[13px] font-bold text-slate-900">{p.count}</span>
          <span className="tabular w-16 text-right text-xs text-slate-400" title={translate("Open pipeline value")}>{money(p.amount, { compact: true })}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Target donut ---------- */

function TargetDonut({ target }: { target: SalesTarget }) {
  const pct = Math.max(0, Math.min(100, Math.round(target.percent)));
  const r = 44;
  const c = 2 * Math.PI * r;
  const remaining = Math.max(0, Number(target.amount) - Number(target.achieved));
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[110px] shrink-0" role="img" aria-label={`Target ${pct}% achieved`}>
        <svg viewBox="0 0 110 110" className="size-full -rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e8ebf3" strokeWidth="11" />
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="#1baf7a"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-xl font-bold text-slate-900">{pct}%</span>
          <span className="text-[10px] text-slate-400">{translate("Achieved")}</span>
        </div>
      </div>
      <dl className="min-w-0 flex-1 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">{translate("Target")}</dt>
          <dd className="tabular font-semibold text-slate-800">{money(target.amount, { compact: true })}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">{translate("Achieved")}</dt>
          <dd className="tabular font-semibold text-slate-800">{money(target.achieved, { compact: true })}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">{translate("Remaining")}</dt>
          <dd className="tabular font-semibold text-slate-800">{money(remaining, { compact: true })}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ---------- Right rail cards ---------- */

function PendingApprovalsCard({ a }: { a: NonNullable<Dashboard['approvals']> }) {
  return (
    <Card
      title={translate("Pending Approvals")}
      actions={<span className="tabular flex size-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{a.pendingCount}</span>}
    >
      {!a.oldest.length ? (
        <p className="text-[13px] text-slate-400">{translate("Nothing waiting for approval.")}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {a.oldest.slice(0, 3).map((r) => (
            <li key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/approvals/${r.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                  Quotation #{r.quotation.number}
                </Link>
                <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(r.createdAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">Customer: {r.quotation.customer.name}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="tabular text-xs font-semibold text-slate-800">
                  {money(r.amount, { currency: r.quotation.currency })}
                </span>
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{translate("Manager")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link to="/approvals" className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        {translate("View all approvals")} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function notificationIcon(type: string) {
  const t = type.toUpperCase();
  if (t.includes('PAYMENT') || t.includes('APPROV')) return <CheckCircle2 className="size-4 shrink-0 text-green-600" />;
  if (t.includes('OVERDUE') || t.includes('FAIL') || t.includes('INVOICE')) return <CircleAlert className="size-4 shrink-0 text-red-600" />;
  if (t.includes('LEAD')) return <UserPlus className="size-4 shrink-0 text-brand-600" />;
  return <Info className="size-4 shrink-0 text-brand-600" />;
}

function NotificationsCard() {
  const { data } = useQuery({
    queryKey: ['notifications', 'rail'],
    queryFn: () => api.get<{ data: Notification[]; unread: number }>('/notifications', { pageSize: 4 }),
    refetchInterval: 60_000,
  });
  const items = data?.data ?? [];
  const unread = data?.unread ?? 0;
  return (
    <Card
      title={translate("Notifications")}
      actions={
        <span className="tabular flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {unread || items.length}
        </span>
      }
    >
      {!items.length ? (
        <p className="text-[13px] text-slate-400">{translate("No notifications yet.")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-2.5">
              {notificationIcon(n.type)}
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-snug font-medium text-slate-800">{n.title}</p>
                <p className="truncate text-[11px] text-slate-400">{n.message}</p>
              </div>
              <span className="shrink-0 text-[10px] whitespace-nowrap text-slate-400">{relativeTime(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/notifications" className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        {translate("View all notifications")} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function MyTargetCard({ targets }: { targets: SalesTarget[] }) {
  const mine = targets[0];
  return (
    <Card title={translate("My Sales Target")}>
      {!mine ? (
        <p className="text-[13px] text-slate-400">{translate("No active target assigned.")}</p>
      ) : (
        <>
          <TargetDonut target={mine} />
          <Link to="/targets" className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
            {translate("View Target Details")} <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
}

/* ---------- Recent quotations ---------- */

function RecentQuotationsCard() {
  const { canAny } = useAuth();
  const canRead = canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all');
  const { data, isLoading } = useQuery({
    queryKey: ['quotations', 'recent'],
    queryFn: () => api.get<Paged<Quotation>>('/quotations', { pageSize: 5, sort: 'createdAt', order: 'desc' }),
    enabled: canRead,
  });
  const rows = data?.data ?? [];
  return (
    <Card
      title={translate("Recent Quotations")}
      actions={
        <Link to="/quotations" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          {translate("View All")}
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <EmptyState icon={FileText} title={translate("No quotations yet")} />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="table-base w-full min-w-[640px]">
            <thead>
              <tr>
                <th>{translate("Quotation No.")}</th>
                <th>{translate("Customer")}</th>
                <th>{translate("Amount")}</th>
                <th>{translate("Status")}</th>
                <th>{translate("Valid Until")}</th>
                <th className="text-right">{translate("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/60">
                  <td>
                    <Link to={`/quotations/${q.id}`} className="font-medium text-brand-600 hover:underline">
                      {q.number}
                    </Link>
                  </td>
                  <td className="text-slate-600">{q.customer.name}</td>
                  <td className="tabular font-medium text-slate-800">{money(q.total, { currency: q.currency })}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td className="whitespace-nowrap text-slate-500">{date(q.validUntil)}</td>
                  <td className="text-right">
                    <Link to={`/quotations/${q.id}`} className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Open ${q.number}`}>
                      <MoreHorizontal className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */

export default function DashboardPage() {
  const { me, canAny } = useAuth();
  const [period, setPeriod] = useState<PerformancePeriod>('month');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<{ data: Dashboard }>('/dashboard')).data,
  });

  const first = me?.user.name.split(' ')[0] ?? 'there';
  const pendingQuotes =
    data?.sales?.quotationsByStatus.filter((q) => ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(q.status)).reduce((n, q) => n + q.count, 0) ?? 0;
  const awaitingApproval = data?.sales?.quotationsByStatus.find((q) => q.status === 'PENDING_APPROVAL')?.count ?? 0;
  const wonNow = Number(data?.sales?.wonThisMonth.amount ?? 0);
  const wonBefore = Number(data?.sales?.wonLastMonth ?? 0);
  // Percentage change only when last month had sales; otherwise there is nothing meaningful to compare.
  const wonChange = wonBefore > 0 ? { value: ((wonNow - wonBefore) / wonBefore) * 100, label: 'vs last month' } : null;
  const shownTarget = data?.sales ? (data.sales.myTarget ?? data.sales.targets[0] ?? null) : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900">
            {translate('Welcome back, {name}!', { name: first })}
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-400">{translate("Here's what's happening with your sales today.")}</p>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* main column */}
          <div className="min-w-0 space-y-5">
            {data.sales && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                <StatCard
                  label="Total Sales (MMK)"
                  value={money(data.sales.wonThisMonth.amount, { compact: true })}
                  change={wonChange}
                  sub={translate('{count} deals won this month', { count: data.sales.wonThisMonth.count })}
                  icon={TrendingUp}
                  tone="brand"
                />
                <StatCard
                  label="Open Opportunities"
                  value={data.sales.openOpportunities.count}
                  sub={translate('{amount} in open pipeline', { amount: money(data.sales.openOpportunities.amount, { compact: true }) })}
                  icon={CircleDot}
                  tone="blue"
                />
                <StatCard
                  label="Pending Quotations"
                  value={pendingQuotes}
                  sub={translate('{count} awaiting approval', { count: awaitingApproval })}
                  icon={FileText}
                  tone="amber"
                />
                <StatCard
                  label="Target Achievement"
                  value={shownTarget ? `${Math.round(shownTarget.percent)}%` : '—'}
                  sub={shownTarget ? translate('{achieved} of {target}', { achieved: money(shownTarget.achieved, { compact: true }), target: money(shownTarget.amount, { compact: true }) }) : 'No active target'}
                  icon={Trophy}
                  tone="green"
                />
              </div>
            )}

            {data.sales && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
                <Card
                  title={translate("Sales Performance")}
                  className="lg:col-span-3"
                  actions={
                    <label className="relative inline-flex items-center rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300">
                      <span className="sr-only">{translate("Chart period")}</span>
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as PerformancePeriod)}
                        className="cursor-pointer appearance-none bg-transparent py-1.5 pr-7 pl-2.5 focus:outline-none"
                      >
                        <option value="month">{translate("This Month")}</option>
                        <option value="six-months">{translate("Last 6 Months")}</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-slate-400" aria-hidden />
                    </label>
                  }
                >
                  <PerformanceChart sales={data.sales} period={period} />
                </Card>
                <Card title={translate("Sales Funnel")} className="lg:col-span-2">
                  <Funnel pipeline={data.sales.pipeline} />
                </Card>
              </div>
            )}

            {canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all') && <RecentQuotationsCard />}

            {data.finance && (
              <Card title={translate("Finance overview")} actions={<Link to="/reports" className="text-[13px] font-medium text-brand-600 hover:underline">{translate("Reports")}</Link>}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard label="Outstanding receivables" value={money(data.finance.receivables.amount, { compact: true })} sub={translate('{count} open invoices', { count: data.finance.receivables.count })} icon={Receipt} tone="blue" />
                  <StatCard label="Overdue" value={money(data.finance.overdue.amount, { compact: true })} sub={translate('{count} past due', { count: data.finance.overdue.count })} icon={CircleAlert} tone="red" />
                  <StatCard label="Collected this month" value={money(data.finance.paymentsThisMonth.amount, { compact: true })} sub={translate('{count} payments', { count: data.finance.paymentsThisMonth.count })} icon={Wallet} tone="green" />
                </div>
              </Card>
            )}
          </div>

          {/* right rail */}
          <div className="min-w-0 space-y-5">
            {data.approvals && <PendingApprovalsCard a={data.approvals} />}
            <NotificationsCard />
            {data.sales && <MyTargetCard targets={data.sales.targets} />}
          </div>
        </div>
      )}

      {/* hidden affordances to keep icons/links reachable */}
      <div className="sr-only">
        <Link to="/leads">{translate("Leads")}</Link>
        <Link to="/overdue">{translate("Overdue")}</Link>
        <Bell aria-hidden />
      </div>
    </div>
  );
}
