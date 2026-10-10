import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Columns3, List, Plus } from 'lucide-react';
import { OPPORTUNITY_STAGES, enumLabel } from '@crm/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Spinner';
import { enumOptions } from '../../components/ui/Pickers';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { date, money } from '../../lib/format';
import type { Opportunity } from '../../lib/types';
import { OpportunityFormModal } from './OpportunityForm';

interface Pipeline {
  stages: { stage: string; count: number; total: string; weighted: string; items: Opportunity[] }[];
}

function Board() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['opportunities', 'pipeline'],
    queryFn: async () => (await api.get<{ data: Pipeline }>('/opportunities/pipeline')).data,
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>;
  return (
    <div className="flex snap-x gap-4 overflow-x-auto pb-2">
      {data.stages.map((s) => (
        <section key={s.stage} className="w-72 shrink-0 snap-start rounded-xl border border-slate-200 bg-slate-100/60" aria-label={enumLabel(s.stage)}>
          <header className="border-b border-slate-200 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <StatusBadge status={s.stage} />
              <span className="text-xs text-slate-500">{s.count}</span>
            </div>
            <p className="tabular mt-1.5 text-sm font-semibold text-slate-900">{money(s.total, { compact: true })}</p>
            <p className="tabular text-xs text-slate-500">Weighted {money(s.weighted, { compact: true })}</p>
          </header>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
            {!s.items.length && <li className="px-2 py-6 text-center text-xs text-slate-400">No deals</li>}
            {s.items.map((o) => (
              <li key={o.id}>
                <Link to={`/opportunities/${o.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow">
                  <p className="text-sm font-medium text-slate-900">{o.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{o.customer.name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="tabular font-semibold text-slate-800">{money(o.amount, { compact: true })}</span>
                    <span className="text-slate-500">{o.expectedCloseDate ? date(o.expectedCloseDate) : '—'}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{o.owner.name} · {o.probability}%</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function OpportunitiesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const lp = useListParams<'stage' | 'status' | 'view'>({ sort: 'expectedCloseDate', order: 'asc' });
  const view = lp.filters.view === 'board' ? 'board' : 'list';
  const { data, isLoading, isFetching, error, refetch } = useList<Opportunity>('opportunities', { ...lp.query, view: undefined }, { enabled: view === 'list' });

  const columns: Column<Opportunity>[] = [
    {
      key: 'name',
      header: 'Opportunity',
      sortKey: 'name',
      cell: (o) => (
        <div>
          <p className="font-medium text-slate-900">{o.name}</p>
          <p className="text-xs text-slate-500">{o.customer.name}</p>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', cell: (o) => <StatusBadge status={o.stage} /> },
    { key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', cell: (o) => <span className="tabular">{money(o.amount)}</span> },
    { key: 'probability', header: 'Prob.', align: 'right', cell: (o) => `${o.probability}%`, hideOnMobile: true },
    { key: 'close', header: 'Expected close', sortKey: 'expectedCloseDate', cell: (o) => date(o.expectedCloseDate), hideOnMobile: true },
    { key: 'owner', header: 'Owner', cell: (o) => o.owner.name, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Sales opportunities by stage."
        actions={
          <>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm" role="group" aria-label="View">
              {(['list', 'board'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => lp.setFilter('view', v === 'list' ? '' : v)}
                  aria-pressed={view === v}
                  className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', view === v ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500')}
                >
                  {v === 'list' ? <List className="size-4" /> : <Columns3 className="size-4" />} {v === 'list' ? 'List' : 'Board'}
                </button>
              ))}
            </div>
            {can('opportunity.create') && <Button icon={Plus} onClick={() => setCreating(true)}>New opportunity</Button>}
          </>
        }
      />
      {view === 'board' ? (
        <Board />
      ) : (
        <div className="card overflow-hidden">
          <Toolbar>
            <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search opportunity or customer…" className="sm:w-80" />
            <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
            <FilterSelect label="Stage" value={lp.filters.stage ?? ''} onChange={(v) => lp.setFilter('stage', v)} options={enumOptions(OPPORTUNITY_STAGES, enumLabel)} />
          </Toolbar>
          <DataTable
            caption="Opportunities"
            columns={columns}
            rows={data?.data}
            loading={isLoading || isFetching}
            error={error}
            onRetry={refetch}
            sort={lp}
            onSort={lp.setSort}
            onRowClick={(o) => navigate(`/opportunities/${o.id}`)}
            empty={<EmptyState icon={Briefcase} title="No opportunities found" />}
          />
          <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
        </div>
      )}
      <OpportunityFormModal open={creating} onClose={() => setCreating(false)} onSaved={(o) => navigate(`/opportunities/${o.id}`)} />
    </div>
  );
}
