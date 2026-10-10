import { useState } from 'react';
import { CalendarCheck, Plus } from 'lucide-react';
import { ACTIVITY_TYPES, enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Tabs, Toolbar } from '../../components/ui/Layout';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Spinner';
import { enumOptions } from '../../components/ui/Pickers';
import type { Activity } from '../../lib/types';
import { ActivityFormModal, ActivityRow } from './ActivityPanel';

export default function ActivitiesPage() {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const lp = useListParams<'state' | 'type'>({ sort: 'dueAt', order: 'asc', state: 'open' });
  const { data, isLoading, error, refetch } = useList<Activity>('activities', lp.query);

  return (
    <div>
      <PageHeader
        title="Activities"
        description="Calls, meetings, emails and tasks."
        actions={can('activity.manage') && <Button icon={Plus} onClick={() => setAdding(true)}>New activity</Button>}
      />
      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs
            value={(lp.filters.state || 'all') as string}
            onChange={(v) => lp.setFilter('state', v === 'all' ? '' : v)}
            tabs={[
              { value: 'open', label: 'Open' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'completed', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search activities…" className="sm:w-72" />
          <FilterSelect label="Type" value={lp.filters.type ?? ''} onChange={(v) => lp.setFilter('type', v)} options={enumOptions(ACTIVITY_TYPES, enumLabel)} />
        </Toolbar>
        <div className="px-5">
          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isLoading ? (
            <div className="space-y-3 py-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !data?.data.length ? (
            <EmptyState icon={CalendarCheck} title="No activities" description="Nothing matches the current filter." />
          ) : (
            <ul className="divide-y divide-slate-100">{data.data.map((a) => <ActivityRow key={a.id} a={a} canManage={can('activity.manage')} />)}</ul>
          )}
        </div>
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      <ActivityFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
