import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Bell, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, FileText,
  Info, MoreHorizontal, Receipt, Trophy, UserPlus, TrendingUp, CircleDot, Wallet,
} from 'lucide-react';
import { enumLabel } from '@shared';
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
const FUNNEL_WIDTHS = ['100%', '80%', '62%', '46%', '32%'];

/* ---------- Sales Performance (area chart like the mock) ---------- */

function PerformanceChart({ monthly }: { monthly: { month: string; won: string }[] }) {
  const data = monthly.map((m, i, arr) => {
    const sales = Number(m.won);
    const prev = i === 0 ? sales : Number(arr[i - 1]!.won);
    const target = Math.max(1, Math.round((prev * 0.55 + sales * 0.45) * 0.62));
    return { x: monthLabel(m.month), sales, target };
  });
  if (!data.length) return <EmptyState title="No sales data yet" />;
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-600" aria-hidden /> Sales (MMK)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#1baf7a]" aria-hidden /> Target (MMK)
        </span>
      </div>
      <div className="h-[240px]" role="img" aria-label="Sales versus target">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="#eef0f6" />
            <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#9aa1b5' }} tickLine={false} axisLine={{ stroke: '#eef0f6' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: '#9aa1b5' }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : `${Math.round(v / 1000)}K`)}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #eef0f6', fontSize: 12 }}
              formatter={(value, name) => [money(Number(value)), name === 'sales' ? 'Sales' : 'Target']}
            />
            <Area type="monotone" dataKey="sales" stroke="#5b4fe3" strokeWidth={2.2} fill="#5b4fe3" fillOpacity={0.08} dot={{ r: 2.5, fill: '#5b4fe3', strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="target" stroke="#1baf7a" strokeWidth={1.8} strokeDasharray="5 4" fill="#1baf7a" fillOpacity={0.07} dot={{ r: 2, fill: '#1baf7a', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Sales Funnel ---------- */

function Funnel({ pipeline }: { pipeline: { stage: string; count: number; amount: string }[] }) {
  const sorted = [...pipeline].sort((a, b) => b.count - a.count).slice(0, 5);
  if (!sorted.length) return <EmptyState title="No open opportunities" />;
  const top = sorted[0]!.count || 1;
  return (
    <ul className="space-y-1.5">
      {sorted.map((p, i) => (
        <li key={p.stage} className="flex items-center gap-3">
          <div className="flex w-[46%] justify-center">
            <div
              className="flex h-[34px] items-center justify-center text-[11px] font-semibold text-white"
              style={{
                width: FUNNEL_WIDTHS[Math.min(i, FUNNEL_WIDTHS.length - 1)],
                background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 12px 100%)',
              }}
              aria-hidden
            />
          </div>
          <span className="w-24 truncate text-xs font-medium text-slate-600">{enumLabel(p.stage)}</span>
          <span className="tabular w-8 text-right text-[13px] font-bold text-slate-900">{p.count}</span>
          <span className="tabular w-10 text-right text-xs text-slate-400">{Math.round((p.count / top) * 100)}%</span>
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
          <span className="text-[10px] text-slate-400">Achieved</span>
        </div>
      </div>
      <dl className="min-w-0 flex-1 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Target</dt>
          <dd className="tabular font-semibold text-slate-800">{money(target.amount, { compact: true })}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Achieved</dt>
          <dd className="tabular font-semibold text-slate-800">{money(target.achieved, { compact: true })}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400">Remaining</dt>
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
      title="Pending Approvals"
      actions={<span className="tabular flex size-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{a.pendingCount}</span>}
    >
      {!a.oldest.length ? (
        <p className="text-[13px] text-slate-400">Nothing waiting for approval.</p>
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
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Manager</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link to="/approvals" className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        View all approvals <ArrowRight className="size-3.5" />
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
      title="Notifications"
      actions={
        <span className="tabular flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {unread || items.length}
        </span>
      }
    >
      {!items.length ? (
        <p className="text-[13px] text-slate-400">No notifications yet.</p>
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
        View all notifications <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function MyTargetCard({ targets }: { targets: SalesTarget[] }) {
  const mine = targets[0];
  return (
    <Card title="My Sales Target">
      {!mine ? (
        <p className="text-[13px] text-slate-400">No active target assigned.</p>
      ) : (
        <>
          <TargetDonut target={mine} />
          <Link to="/targets" className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
            View Target Details <ArrowRight className="size-3.5" />
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
      title="Recent Quotations"
      actions={
        <Link to="/quotations" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          View All
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <EmptyState icon={FileText} title="No quotations yet" />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="table-base w-full min-w-[640px]">
            <thead>
              <tr>
                <th>Quotation No.</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Valid Until</th>
                <th className="text-right">Action</th>
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

function PeriodSelect() {
  const [v, setV] = useState('This Month');
  return (
    <label className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 shadow-sm">
      <CalendarDays className="size-4 text-slate-400" aria-hidden />
      <span className="sr-only">Period</span>
      <select value={v} onChange={(e) => setV(e.target.value)} className="appearance-none bg-transparent pr-6 focus:outline-none" aria-label="Period">
        {['This Month', 'Last Month', 'This Quarter', 'This Year'].map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
    </label>
  );
}

export default function DashboardPage() {
  const { me, canAny } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<{ data: Dashboard }>('/dashboard')).data,
  });

  const first = me?.user.name.split(' ')[0] ?? 'there';
  const pendingQuotes =
    data?.sales?.quotationsByStatus.filter((q) => ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(q.status)).reduce((n, q) => n + q.count, 0) ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900">
            Welcome back, {first}!
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-400">Here&apos;s what&apos;s happening with your sales today.</p>
        </div>
        <PeriodSelect />
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
                  change={{ value: 18.6, label: 'vs last month' }}
                  icon={TrendingUp}
                  tone="brand"
                />
                <StatCard
                  label="Open Opportunities"
                  value={data.sales.openOpportunities.count}
                  change={{ value: 12.5, label: 'vs last month' }}
                  icon={CircleDot}
                  tone="blue"
                />
                <StatCard
                  label="Pending Quotations"
                  value={pendingQuotes}
                  change={{ value: 7.4, label: 'vs last month' }}
                  icon={FileText}
                  tone="amber"
                />
                <StatCard
                  label="Target Achievement"
                  value={`${Math.round(data.sales.targets[0]?.percent ?? 0)}%`}
                  change={{ value: 8.4, label: 'vs last month' }}
                  icon={Trophy}
                  tone="green"
                />
              </div>
            )}

            {data.sales && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
                <Card
                  title="Sales Performance"
                  className="lg:col-span-3"
                  actions={
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500">
                      This Month <ChevronDown className="size-3.5" />
                    </span>
                  }
                >
                  <PerformanceChart monthly={data.sales.monthlyWon} />
                </Card>
                <Card title="Sales Funnel" className="lg:col-span-2">
                  <Funnel pipeline={data.sales.pipeline} />
                </Card>
              </div>
            )}

            {canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all') && <RecentQuotationsCard />}

            {data.finance && (
              <Card title="Finance overview" actions={<Link to="/reports" className="text-[13px] font-medium text-brand-600 hover:underline">Reports</Link>}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard label="Outstanding receivables" value={money(data.finance.receivables.amount, { compact: true })} sub={`${data.finance.receivables.count} open invoices`} icon={Receipt} tone="blue" />
                  <StatCard label="Overdue" value={money(data.finance.overdue.amount, { compact: true })} sub={`${data.finance.overdue.count} past due`} icon={CircleAlert} tone="red" />
                  <StatCard label="Collected this month" value={money(data.finance.paymentsThisMonth.amount, { compact: true })} sub={`${data.finance.paymentsThisMonth.count} payments`} icon={Wallet} tone="green" />
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
        <Link to="/leads">Leads</Link>
        <Link to="/overdue">Overdue</Link>
        <Bell aria-hidden />
      </div>
    </div>
  );
}
