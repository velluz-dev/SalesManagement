import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Bell, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, FileText, Handshake,
  Info, ListChecks, LogIn, Mail, MonitorSmartphone, MoreHorizontal, Phone, Receipt, ShieldAlert, StickyNote, Trophy, UserPlus, Users, TrendingUp, CircleDot, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { currentLocale, enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { api, type Paged } from '../../lib/api';
import { date, money, monthLabel, relativeTime } from '../../lib/format';
import { Card, StatCard } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ErrorState, EmptyState } from '../../components/ui/EmptyState';
import { ReportSkeleton, Skeleton } from '../../components/ui/Spinner';
import { cn } from '../../lib/cn';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Notification, Quotation, SalesTarget, UserRef } from '../../lib/types';

interface FollowUps {
  total: number;
  overdue: number;
  items: { kind: 'activity' | 'lead'; id: string; type: string | null; title: string; related: string | null; link: string; dueAt: string; overdue: boolean; owner: UserRef }[];
}

interface PerformanceRow {
  id: string;
  name: string;
  achieved: string;
  target: string | null;
  percent: number | null;
  pipeline: string;
  overdueFollowUps: number;
}

interface TeamPerformance {
  basis: string;
  members: (PerformanceRow & { team: { id: string; name: string } | null; openDeals: number })[];
  teams: (PerformanceRow & { members: number })[] | null;
}

const FOLLOW_UP_ICONS: Record<string, LucideIcon> = { CALL: Phone, MEETING: Handshake, EMAIL: Mail, TASK: ListChecks, NOTE: StickyNote };

const daysSince = (d: string) => Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

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
    followUps: FollowUps;
    team: TeamPerformance | null;
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

type PerformancePeriod = 'month' | 'six-months';

const yTick = (v: number) => (v >= 1_000_000_000 ? `${+(v / 1_000_000_000).toFixed(1)}B` : v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(v));

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

function Funnel({ pipeline }: { pipeline: { stage: string; count: number; amount: string }[] }) {
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
            stroke="#5b4fe3"
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

function PendingApprovalsCard({ a, className }: { a: NonNullable<Dashboard['approvals']>; className?: string }) {
  return (
    <Card
      className={cn('flex flex-col', className)}
      bodyClassName="flex flex-1 flex-col"
      title={translate("Pending Approvals")}
      actions={<span className="tabular flex size-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{a.pendingCount}</span>}
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
      <Link to="/approvals" className="mt-auto flex pt-3 items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        {translate("View all approvals")} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function notificationIcon(type: string) {
  const t = type.toUpperCase();
  if (t.includes('FOLLOW_UP')) return <CalendarClock className="size-4 shrink-0 text-brand-600" />;
  if (t.includes('DUE_SOON') || t.includes('EXPIRED')) return <CalendarClock className="size-4 shrink-0 text-amber-600" />;
  if (t.includes('PAYMENT') || t.includes('APPROV')) return <CheckCircle2 className="size-4 shrink-0 text-green-600" />;
  if (t.includes('OVERDUE') || t.includes('FAIL') || t.includes('INVOICE')) return <CircleAlert className="size-4 shrink-0 text-red-600" />;
  if (t.includes('LEAD')) return <UserPlus className="size-4 shrink-0 text-brand-600" />;
  return <Info className="size-4 shrink-0 text-brand-600" />;
}

function NotificationsCard({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ['notifications', 'rail'],
    queryFn: () => api.get<{ data: Notification[]; unread: number }>('/notifications', { pageSize: 4 }),
    refetchInterval: 60_000,
  });
  const items = data?.data ?? [];
  const unread = data?.unread ?? 0;
  return (
    <Card
      className={cn('flex flex-col', className)}
      bodyClassName="flex flex-1 flex-col"
      title={translate("Notifications")}
      actions={
        <span className="tabular flex size-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
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
      <Link to="/notifications" className="mt-auto flex pt-3 items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        {translate("View all notifications")} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function MyTargetCard({ target, className }: { target: SalesTarget | null; className?: string }) {
  const mine = target;
  return (
    <Card title={translate("My Sales Target")} className={cn('flex flex-col', className)} bodyClassName="flex flex-1 flex-col">
      {!mine ? (
        <p className="text-[13px] text-slate-400">{translate("No active target assigned.")}</p>
      ) : (
        <>
          <div className="flex flex-1 items-center">
            <TargetDonut target={mine} />
          </div>
          <Link to="/targets" className="flex pt-3 items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
            {translate("View Target Details")} <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
}

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

function AdminOverview({ a }: { a: NonNullable<Dashboard['admin']> }) {
  const signIns = a.logins.reduce((n, l) => n + l.success, 0);
  const failed = a.logins.reduce((n, l) => n + l.failed, 0);
  const busiest = Math.max(1, ...a.logins.map((l) => l.success + l.failed));
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Users"
          value={a.users.total}
          sub={translate('{active} active, {inactive} inactive', { active: a.users.active, inactive: a.users.inactive })}
          icon={Users}
        />
        <StatCard label="Active sessions" value={a.activeSessions} sub={translate('Signed in right now')} icon={MonitorSmartphone} />
        <StatCard
          label="Sign-ins this week"
          value={signIns}
          sub={translate('{count} failed attempts', { count: failed })}
          icon={LogIn}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card title={translate('Sign-ins, last 7 days')} className="lg:col-span-3">
          <ul className="space-y-2.5">
            {a.logins.map((l) => (
              <li key={l.day} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[13px]">
                <span className="text-slate-500">{dayLabel(l.day)}</span>
                <span className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <span className="bg-brand-500" style={{ width: `${(l.success / busiest) * 100}%` }} />
                  <span className="bg-rose-500" style={{ width: `${(l.failed / busiest) * 100}%` }} />
                </span>
                <span className="tabular text-right font-medium text-slate-700">
                  {l.success}
                  {l.failed > 0 && <span className="ml-1 text-rose-600">+{l.failed}</span>}
                  <span className="sr-only">{translate('{count} failed attempts', { count: l.failed })}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-500" aria-hidden />{translate('Successful')}</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" aria-hidden />{translate('Failed')}</span>
          </p>
        </Card>

        <Card
          title={translate('Users by role')}
          className="lg:col-span-2"
          actions={<Link to="/admin/roles" className="text-[13px] font-medium text-brand-600 hover:underline">{translate('Manage roles')}</Link>}
        >
          <ul className="divide-y divide-slate-100">
            {a.roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="truncate text-slate-700">{enumLabel(r.code)}</span>
                <span className="tabular rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{r.users}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title={translate('Recent activity')}
        actions={<Link to="/admin/audit" className="text-[13px] font-medium text-brand-600 hover:underline">{translate('Audit Log')}</Link>}
      >
        {!a.recentActivity.length ? (
          <p className="text-[13px] text-slate-500">{translate('No activity yet.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {a.recentActivity.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2.5">
                  <code className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${e.action.includes('failed') ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{e.action}</code>
                  <span className="truncate text-slate-700">{e.actor?.name ?? translate('System')}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{relativeTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function FollowUpsCard({ f, showOwner, limit = 8, className }: { f: FollowUps; showOwner: boolean; limit?: number; className?: string }) {
  const { canAny } = useAuth();
  const allLink = canAny('activity.read.own', 'activity.read.team', 'activity.read.all') ? '/activities?state=overdue' : '/leads?followUp=due';
  return (
    <Card
      className={cn('flex flex-col', className)}
      bodyClassName="flex flex-1 flex-col"
      title={translate('Follow-ups due')}
      description={f.overdue ? translate('{count} overdue', { count: f.overdue }) : undefined}
      actions={<span className="tabular flex size-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{f.total}</span>}
    >
      {!f.items.length ? (
        <p className="text-[13px] text-slate-400">{translate('Nothing due today. Schedule the next call from a lead or deal.')}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {f.items.slice(0, limit).map((i) => {
            const Icon = i.kind === 'lead' ? UserPlus : FOLLOW_UP_ICONS[i.type ?? ''] ?? CalendarClock;
            return (
              <li key={`${i.kind}-${i.id}`} className="py-2.5 first:pt-0 last:pb-0">
                <Link to={i.link} className="group flex items-start gap-2.5">
                  <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', i.overdue ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600')}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-brand-600">{i.title}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {[i.related, showOwner ? i.owner.name : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-[11px] whitespace-nowrap', i.overdue ? 'font-medium text-rose-600' : 'text-slate-400')}>{relativeTime(i.dueAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={allLink} className="mt-auto flex items-center justify-center gap-1 pt-3 text-[13px] font-medium text-brand-600 hover:underline">
        {translate('View all follow-ups')} <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

function AchievementBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-xs text-slate-400">{translate('No target')}</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <span className="tabular w-9 text-right text-xs font-semibold text-slate-700">{percent}%</span>
    </div>
  );
}

function TeamPerformanceCard({ team, className }: { team: TeamPerformance; className?: string }) {
  const [view, setView] = useState<'teams' | 'members'>(team.teams ? 'teams' : 'members');
  const rows = view === 'teams' && team.teams ? team.teams : team.members;
  return (
    <Card
      className={className}
      title={translate(team.teams ? 'Performance this month' : 'Team performance this month')}
      description={translate(team.basis === 'INVOICED' ? 'Achievement counts invoiced sales' : 'Achievement counts won deals')}
      actions={
        team.teams && (
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            {(['teams', 'members'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn('rounded-md px-2.5 py-1', view === v ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800')}
              >
                {translate(v === 'teams' ? 'By team' : 'By salesperson')}
              </button>
            ))}
          </div>
        )
      }
    >
      {!rows.length ? (
        <EmptyState icon={Users} title={translate('No salespeople yet')} />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="table-base w-full min-w-[620px]">
            <thead>
              <tr>
                <th>{translate(view === 'teams' ? 'Team' : 'Salesperson')}</th>
                <th className="text-right">{translate('Achieved')}</th>
                <th className="text-right">{translate('Target')}</th>
                <th>{translate('Progress')}</th>
                <th className="text-right">{translate('Open pipeline')}</th>
                <th className="text-right">{translate('Overdue follow-ups')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="font-medium text-slate-800">{r.name}</span>
                    {'members' in r ? (
                      <span className="block text-[11px] text-slate-400">{translate('{count} members', { count: r.members })}</span>
                    ) : (
                      r.team && view === 'members' && team.teams && <span className="block text-[11px] text-slate-400">{r.team.name}</span>
                    )}
                  </td>
                  <td className="tabular text-right font-medium text-slate-800">{money(r.achieved, { compact: true })}</td>
                  <td className="tabular text-right text-slate-500">{r.target ? money(r.target, { compact: true }) : '—'}</td>
                  <td><AchievementBar percent={r.percent} /></td>
                  <td className="tabular text-right text-slate-600">{money(r.pipeline, { compact: true })}</td>
                  <td className="text-right">
                    {r.overdueFollowUps ? (
                      <span className="tabular inline-flex min-w-6 justify-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">{r.overdueFollowUps}</span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
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

const AGING_LABELS: Record<string, string> = { current: 'Not yet due', '1-30': '1 to 30 days', '31-60': '31 to 60 days', '61-90': '61 to 90 days', '90+': 'Over 90 days' };

function FinanceOverview({ f }: { f: NonNullable<Dashboard['finance']> }) {
  const largestBucket = Math.max(1, ...f.aging.map((a) => Number(a.amount)));
  const chart = f.monthly.map((m) => ({ month: monthLabel(m.month), invoiced: Number(m.invoiced), collected: Number(m.collected) }));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding receivables" value={money(f.receivables.amount, { compact: true })} sub={translate('{count} open invoices', { count: f.receivables.count })} icon={Receipt} />
        <StatCard label="Overdue" value={money(f.overdue.amount, { compact: true })} sub={translate('{count} past due', { count: f.overdue.count })} icon={CircleAlert} />
        <StatCard label="Collected this month" value={money(f.paymentsThisMonth.amount, { compact: true })} sub={translate('{count} payments', { count: f.paymentsThisMonth.count })} icon={Wallet} />
        <StatCard
          label="Credit risk"
          value={f.credit.customersOverLimit}
          sub={translate('{over} over limit, {hold} on hold', { over: f.credit.customersOverLimit, hold: f.credit.customersOnHold })}
          icon={ShieldAlert}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card title={translate('Invoiced vs collected')} className="lg:col-span-3" actions={<Link to="/reports?tab=finance" className="text-[13px] font-medium text-brand-600 hover:underline">{translate('Reports')}</Link>}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="#eef0f6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: number) => money(v, { compact: true })} />
                <Tooltip cursor={{ fill: '#f5f6fa' }} formatter={(v) => money(Number(v))} />
                <Bar dataKey="invoiced" name={translate('Invoiced')} fill="#c6cbff" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="collected" name={translate('Collected')} fill="#5b4fe3" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-200" aria-hidden />{translate('Invoiced')}</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-600" aria-hidden />{translate('Collected')}</span>
          </div>
        </Card>
        <Card title={translate('Receivables aging')} className="lg:col-span-2">
          <ul className="space-y-3">
            {f.aging.map((a) => (
              <li key={a.bucket} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-[13px]">
                <span className="text-slate-500">{translate(AGING_LABELS[a.bucket] ?? a.bucket)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={cn('block h-full rounded-full', a.bucket === 'current' ? 'bg-brand-300' : 'bg-brand-600')}
                    style={{ width: `${(Number(a.amount) / largestBucket) * 100}%` }}
                  />
                </span>
                <span className="tabular text-right font-medium text-slate-800">{money(a.amount, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card
        title={translate('Overdue invoices')}
        actions={<Link to="/overdue" className="text-[13px] font-medium text-brand-600 hover:underline">{translate('View all')}</Link>}
      >
        {!f.overdueInvoices.length ? (
          <p className="text-[13px] text-slate-400">{translate('No overdue invoices. Every customer is paying on time.')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="table-base w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>{translate('Invoice')}</th>
                  <th>{translate('Customer')}</th>
                  <th>{translate('Due')}</th>
                  <th className="text-right">{translate('Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {f.overdueInvoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/invoices/${i.id}`} className="font-medium text-brand-600 hover:underline">{i.number}</Link></td>
                    <td className="text-slate-600">{i.customer.name}</td>
                    <td className="whitespace-nowrap">
                      <span className="text-slate-600">{date(i.dueDate)}</span>
                      <span className="ml-2 text-xs font-medium text-rose-600">{translate('{days} days late', { days: daysSince(i.dueDate) })}</span>
                    </td>
                    <td className="tabular text-right font-medium text-slate-800">{money(i.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function DashboardPage() {
  const { me, canAny, settings } = useAuth();
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
  const wonChange = wonBefore > 0 ? { value: ((wonNow - wonBefore) / wonBefore) * 100, label: 'vs last month' } : null;
  const myTarget = data?.sales?.myTarget ?? null;
  const team = data?.sales?.team ?? null;
  const teamTarget = (team?.members ?? []).filter((m) => m.target).reduce((t, m) => ({ achieved: t.achieved + Number(m.achieved), amount: t.amount + Number(m.target) }), { achieved: 0, amount: 0 });
  const shownTarget = myTarget
    ? { percent: Number(myTarget.percent), achieved: myTarget.achieved, amount: myTarget.amount }
    : teamTarget.amount > 0
      ? { percent: (teamTarget.achieved / teamTarget.amount) * 100, achieved: teamTarget.achieved, amount: teamTarget.amount }
      : null;
  const followUpsInRail = !!team && !myTarget;
  const canReadQuotes = canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all');
  const ownFollowUps = !!data?.sales && !data.sales.team;
  const sideCards = !!data && (!!data.approvals || !data.sales || ownFollowUps);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900">
            {translate('Welcome back, {name}!', { name: first })}
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-400">
            {translate(data && !data.sales && !data.finance && !data.approvals && data.admin ? "Here's what's happening across your workspace today." : "Here's what's happening with your sales today.")}
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <ReportSkeleton />
      ) : (
        <div className="space-y-5">
          {data.sales && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                  <StatCard
                    label={translate('Total sales ({currency})', { currency: settings?.['company.currency'] ?? 'MMK' })}
                    value={money(data.sales.wonThisMonth.amount, { compact: true })}
                    change={wonChange}
                    sub={translate('{count} deals won this month', { count: data.sales.wonThisMonth.count })}
                    icon={TrendingUp}
                  />
                  <StatCard
                    label="Open Opportunities"
                    value={data.sales.openOpportunities.count}
                    sub={translate('{amount} in open pipeline', { amount: money(data.sales.openOpportunities.amount, { compact: true }) })}
                    icon={CircleDot}
                  />
                  <StatCard
                    label="Pending Quotations"
                    value={pendingQuotes}
                    sub={translate('{count} awaiting approval', { count: awaitingApproval })}
                    icon={FileText}
                  />
                  <StatCard
                    label={myTarget || !team ? 'Target Achievement' : 'Team target achievement'}
                    value={shownTarget ? `${Math.round(shownTarget.percent)}%` : '—'}
                    sub={shownTarget ? translate('{achieved} of {target}', { achieved: money(shownTarget.achieved, { compact: true }), target: money(shownTarget.amount, { compact: true }) }) : 'No active target'}
                    icon={Trophy}
                  />
                </div>
                <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-5">
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
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-5 md:auto-cols-fr md:grid-flow-col xl:flex xl:flex-col">
                <NotificationsCard />
                {followUpsInRail ? (
                  <FollowUpsCard f={data.sales.followUps} showOwner limit={5} className="xl:flex-1" />
                ) : (
                  <MyTargetCard target={myTarget} className="xl:flex-1" />
                )}
              </div>
            </div>
          )}

          {data.sales?.team && (followUpsInRail ? (
            <TeamPerformanceCard team={data.sales.team} />
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <TeamPerformanceCard team={data.sales.team} className="min-w-0" />
              <FollowUpsCard f={data.sales.followUps} showOwner limit={5} />
            </div>
          ))}

          {data.admin && <AdminOverview a={data.admin} />}

          {data.finance && <FinanceOverview f={data.finance} />}

          {(canReadQuotes || sideCards) && (
            <div className={cn('grid grid-cols-1 gap-5', canReadQuotes && sideCards && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
              {canReadQuotes && <RecentQuotationsCard />}
              {sideCards && (
                <div className={cn('grid min-w-0 grid-cols-1 gap-5 md:auto-cols-fr md:grid-flow-col', canReadQuotes && 'xl:flex xl:flex-col')}>
                  {data.approvals && <PendingApprovalsCard a={data.approvals} className="xl:flex-1" />}
                  {ownFollowUps && data.sales && <FollowUpsCard f={data.sales.followUps} showOwner={false} className="xl:flex-1" />}
                  {!data.sales && <NotificationsCard className="xl:flex-1" />}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sr-only">
        <Link to="/leads">{translate("Leads")}</Link>
        <Link to="/overdue">{translate("Overdue")}</Link>
        <Bell aria-hidden />
      </div>
    </div>
  );
}
