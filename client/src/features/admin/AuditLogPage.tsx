import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { api } from '../../lib/api';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { DescriptionList } from '../../components/ui/Layout';
import { EMPTY, dateTime } from '../../lib/format';
import type { AuditLog } from '../../lib/types';

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="text-sm text-slate-400">{EMPTY}</p>;
  return <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AuditLogPage() {
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const lp = useListParams<'action' | 'entityType' | 'from' | 'to'>({ sort: 'createdAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<AuditLog>('audit-logs', lp.query);
  const facets = useQuery({ queryKey: ['audit-logs', 'facets'], queryFn: async () => (await api.get<{ data: { actions: string[]; entityTypes: string[] } }>('/audit-logs/facets')).data });

  const columns: Column<AuditLog>[] = [
    { key: 'createdAt', header: 'Time', sortKey: 'createdAt', cell: (l) => <span className="whitespace-nowrap">{dateTime(l.createdAt)}</span> },
    { key: 'actor', header: 'Actor', cell: (l) => l.actor?.name ?? <span className="text-slate-400">System / anonymous</span> },
    { key: 'action', header: 'Action', cell: (l) => <code className={`rounded px-1.5 py-0.5 text-xs ${l.action.includes('failed') ? 'bg-rose-50 text-rose-700' : 'bg-slate-100'}`}>{l.action}</code> },
    { key: 'entity', header: 'Entity', cell: (l) => <span className="text-xs">{l.entityType}{l.entityId && <span className="block text-slate-400">{l.entityId.slice(0, 8)}…</span>}</span>, hideOnMobile: true },
    { key: 'ip', header: 'IP', cell: (l) => <span className="text-xs text-slate-500">{l.ip ?? EMPTY}</span>, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader title="Audit log" description="Immutable record of sign-ins, administrative, sales-workflow and financial actions." />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search action, entity, actor…" className="sm:w-72" />
          <FilterSelect label="Action" value={lp.filters.action ?? ''} onChange={(v) => lp.setFilter('action', v)} options={(facets.data?.actions ?? []).map((a) => ({ value: a, label: a }))} />
          <FilterSelect label="Entity" value={lp.filters.entityType ?? ''} onChange={(v) => lp.setFilter('entityType', v)} options={(facets.data?.entityTypes ?? []).map((a) => ({ value: a, label: a }))} />
          <label className="flex items-center gap-2 text-sm text-slate-600">From <input type="date" className="h-10 rounded-lg border border-slate-300 px-2" value={lp.filters.from ?? ''} onChange={(e) => lp.setFilter('from', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm text-slate-600">To <input type="date" className="h-10 rounded-lg border border-slate-300 px-2" value={lp.filters.to ?? ''} onChange={(e) => lp.setFilter('to', e.target.value)} /></label>
        </Toolbar>
        <DataTable
          caption="Audit log entries"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={setSelected}
          empty={<EmptyState icon={ScrollText} title="No audit entries" />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.action ?? ''} size="xl">
        {selected && (
          <div className="space-y-5">
            <DescriptionList
              columns={3}
              items={[
                { label: 'Time', value: dateTime(selected.createdAt) },
                { label: 'Actor', value: selected.actor ? `${selected.actor.name} (${selected.actor.email})` : 'System / anonymous' },
                { label: 'IP address', value: selected.ip },
                { label: 'Entity', value: selected.entityType },
                { label: 'Entity ID', value: <code className="text-xs">{selected.entityId ?? EMPTY}</code> },
                { label: 'User agent', value: <span className="text-xs">{selected.userAgent ?? EMPTY}</span> },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div><p className="mb-1.5 text-xs font-medium text-slate-500">Before</p><Json value={selected.before} /></div>
              <div><p className="mb-1.5 text-xs font-medium text-slate-500">After</p><Json value={selected.after} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
