import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock, Briefcase, CheckSquare, Contact, FileText, KeyRound, ShieldCheck, Trophy, Users, Wallet, Receipt, Activity,
} from 'lucide-react';
import { enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { date, money, monthLabel, relativeTime } from '../../lib/format';
import { Card, PageHeader, ProgressBar, StatCard } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ErrorState, EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Spinner';
import { BarsChart, HBarsChart } from '../../components/charts/Charts';
import type { SalesTarget, UserRef } from '../../lib/types';

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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function TargetsCard({ targets, basis }: { targets: SalesTarget[]; basis: string }) {
  return (
    <Card
      title="Target progress"
      description={`Current period, counted on ${basis === 'INVOICED' ? 'invoiced amount' : 'won opportunities'}`}
      actions={<Link to="/targets" className="text-sm font-medium text-brand-600 hover:text-brand-700">View all</Link>}
    >
      {!targets.length ? (
        <p className="text-sm text-slate-500">No active targets for the current period.</p>
      ) : (
        <ul className="space-y-4">
          {targets.map((t) => (
            <li key={t.id}>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{t.user?.name ?? t.team?.name}</p>
                  <p className="text-xs text-slate-500">{enumLabel(t.periodType)}, ends {date(t.periodEnd)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm font-semibold text-slate-900">{t.percent}%</p>
                  <p className="tabular text-xs text-slate-500">{money(t.achieved, { compact: true })} of {money(t.amount, { compact: true })}</p>
                </div>
              </div>
              <ProgressBar value={t.percent} label={`${t.user?.name ?? t.team?.name} target progress`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SalesSection({ s }: { s: NonNullable<Dashboard['sales']> }) {
  const quotes = (st: string[]) => s.quotationsByStatus.filter((q) => st.includes(q.status)).reduce((n, q) => n + q.count, 0);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active leads" value={s.activeLeads} icon={Contact} sub="New, contacted or qualified" />
        <StatCard label="Open pipeline" value={money(s.openOpportunities.amount, { compact: true })} sub={`${s.openOpportunities.count} open opportunities`} icon={Briefcase} tone="teal" />
        <StatCard label="Won this month" value={money(s.wonThisMonth.amount, { compact: true })} sub={`${s.wonThisMonth.count} deals closed`} icon={Trophy} tone="green" />
        <StatCard label="Quotations in progress" value={quotes(['DRAFT', 'PENDING_APPROVAL', 'REJECTED'])} sub={`${quotes(['PENDING_APPROVAL'])} awaiting approval`} icon={FileText} tone="amber" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Won revenue" description="Closed-won opportunity value, last 6 months" className="xl:col-span-2">
          <BarsChart rows={s.monthlyWon} xKey="month" xLabel="Month" xFormat={monthLabel} series={[{ key: 'won', label: 'Won' }]} />
        </Card>
        <TargetsCard targets={s.targets} basis={s.achievementBasis} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Open pipeline by stage">
          {s.pipeline.length ? (
            <HBarsChart rows={s.pipeline} yKey="stage" yLabel="Stage" yFormat={enumLabel} series={{ key: 'amount', label: 'Value' }} />
          ) : (
            <EmptyState title="No open opportunities" />
          )}
        </Card>
        <Card title="Quotations by status" actions={<Link to="/quotations" className="text-sm font-medium text-brand-600 hover:text-brand-700">Open quotations</Link>}>
          {!s.quotationsByStatus.length ? (
            <EmptyState title="No quotations yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.quotationsByStatus.map((q) => (
                <li key={q.status} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/quotations?status=${q.status}`} className="hover:underline"><StatusBadge status={q.status} /></Link>
                  <span className="tabular text-slate-600">
                    {q.count} {q.count === 1 ? 'quote' : 'quotes'}<span className="ml-3 font-medium text-slate-900">{money(q.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ApprovalsSection({ a }: { a: NonNullable<Dashboard['approvals']> }) {
  return (
    <Card
      title="Pending approvals"
      description={`${a.pendingCount} request${a.pendingCount === 1 ? '' : 's'} totalling ${money(a.pendingAmount)}`}
      actions={<Link to="/approvals" className="text-sm font-medium text-brand-600 hover:text-brand-700">Review queue</Link>}
    >
      {!a.oldest.length ? (
        <EmptyState icon={CheckSquare} title="Nothing waiting for you" description="New approval requests will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {a.oldest.map((r) => (
            <li key={r.id}>
              <Link to={`/approvals/${r.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {r.quotation.number} v{r.quotation.version} for {r.quotation.customer.name}
                  </p>
                  <p className="text-xs text-slate-500">Requested by {r.requestedBy.name}, {relativeTime(r.createdAt)}</p>
                </div>
                <span className="tabular text-sm font-semibold">{money(r.amount, { currency: r.quotation.currency })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FinanceSection({ f }: { f: NonNullable<Dashboard['finance']> }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding receivables" value={money(f.receivables.amount, { compact: true })} sub={`${f.receivables.count} open invoices`} icon={Receipt} />
        <StatCard label="Overdue" value={money(f.overdue.amount, { compact: true })} sub={`${f.overdue.count} invoices past due`} icon={AlarmClock} tone="red" />
        <StatCard label="Received this month" value={money(f.paymentsThisMonth.amount, { compact: true })} sub={`${f.paymentsThisMonth.count} payments`} icon={Wallet} tone="green" />
        <StatCard
          label="Credit exposure"
          value={money(f.credit.totalExposure, { compact: true })}
          sub={`of ${money(f.credit.totalLimit, { compact: true })} in limits. ${f.credit.customersOverLimit} over limit, ${f.credit.customersOnHold} on hold`}
          icon={ShieldCheck}
          tone="amber"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Invoiced vs collected" description="Last 6 months" className="xl:col-span-2">
          <BarsChart
            rows={f.monthly}
            xKey="month"
            xLabel="Month"
            xFormat={monthLabel}
            series={[
              { key: 'invoiced', label: 'Invoiced' },
              { key: 'collected', label: 'Collected' },
            ]}
          />
        </Card>
        <Card title="Receivables aging">
          <HBarsChart rows={f.aging} yKey="bucket" yLabel="Days past due" series={{ key: 'amount', label: 'Outstanding' }} />
        </Card>
      </div>
      <Card title="Most overdue invoices" actions={<Link to="/overdue" className="text-sm font-medium text-brand-600 hover:text-brand-700">All overdue</Link>}>
        {!f.overdueInvoices.length ? (
          <EmptyState title="No overdue invoices" description="Every issued invoice is still within its payment terms." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {f.overdueInvoices.map((i) => (
              <li key={i.id}>
                <Link to={`/invoices/${i.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium">{i.number}, {i.customer.name}</p>
                    <p className="text-xs text-rose-600">Due {date(i.dueDate)}</p>
                  </div>
                  <span className="tabular text-sm font-semibold">{money(i.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function AdminSection({ a }: { a: NonNullable<Dashboard['admin']> }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={a.users.total} sub={`${a.users.active} active, ${a.users.inactive} inactive`} icon={Users} />
        <StatCard label="Active sessions" value={a.activeSessions} icon={Activity} tone="teal" />
        <StatCard label="Roles" value={a.roles.length} icon={KeyRound} tone="slate" />
        <StatCard label="Failed sign-ins (7d)" value={a.logins.reduce((n, l) => n + l.failed, 0)} icon={ShieldCheck} tone="red" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Sign-ins, last 7 days" className="xl:col-span-2">
          <BarsChart
            rows={a.logins}
            xKey="day"
            xLabel="Day"
            xFormat={(d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
            series={[
              { key: 'success', label: 'Successful', format: (v) => String(v) },
              { key: 'failed', label: 'Failed', format: (v) => String(v) },
            ]}
          />
        </Card>
        <Card title="Users by role" actions={<Link to="/admin/roles" className="text-sm font-medium text-brand-600 hover:text-brand-700">Manage</Link>}>
          <ul className="divide-y divide-slate-100">
            {a.roles.map((r) => (
              <li key={r.id} className="flex justify-between py-2.5 text-sm">
                <span>{r.name}</span>
                <span className="tabular font-medium">{r.users}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {a.recentActivity.length > 0 && (
        <Card title="Recent system activity" actions={<Link to="/admin/audit" className="text-sm font-medium text-brand-600 hover:text-brand-700">Audit log</Link>}>
          <ul className="divide-y divide-slate-100">
            {a.recentActivity.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{e.actor?.name ?? 'System'}</span> <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{e.action}</code>
                </span>
                <span className="text-xs whitespace-nowrap text-slate-500">{relativeTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function DashboardPage() {
  const { me } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<{ data: Dashboard }>('/dashboard')).data,
  });

  return (
    <div>
      <PageHeader title={`${greeting()}, ${me?.user.name.split(' ')[0]}`} description="Here is what is happening across your area of responsibility." />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {data.approvals && data.approvals.pendingCount > 0 && <ApprovalsSection a={data.approvals} />}
          {data.sales && <SalesSection s={data.sales} />}
          {data.approvals && data.approvals.pendingCount === 0 && <ApprovalsSection a={data.approvals} />}
          {data.finance && <FinanceSection f={data.finance} />}
          {data.admin && <AdminSection a={data.admin} />}
          {!data.sales && !data.finance && !data.admin && !data.approvals && (
            <EmptyState title="No dashboard widgets" description="Your role has no dashboard data assigned." />
          )}
        </div>
      )}
    </div>
  );
}
