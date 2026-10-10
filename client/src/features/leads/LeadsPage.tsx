import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, Plus } from 'lucide-react';
import { LEAD_SOURCES, LEAD_STATUSES } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { enumOptions } from '../../components/ui/Pickers';
import { date, money } from '../../lib/format';
import type { Lead } from '../../lib/types';
import { LeadFormModal } from './LeadForm';

export default function LeadsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const lp = useListParams<'status' | 'source'>({ sort: 'createdAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<Lead>('leads', lp.query);

  const columns: Column<Lead>[] = [
    {
      key: 'title',
      header: 'Lead',
      sortKey: 'title',
      cell: (l) => (
        <div>
          <p className="font-medium text-slate-900">{l.title}</p>
          <p className="text-xs text-slate-500">{l.contactName}{l.company ? ` at ${l.company}` : ''}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
    { key: 'source', header: 'Source', cell: (l) => enumLabel(l.source), hideOnMobile: true },
    { key: 'value', header: 'Est. value', sortKey: 'estimatedValue', align: 'right', cell: (l) => <span className="tabular">{money(l.estimatedValue)}</span> },
    { key: 'owner', header: 'Owner', cell: (l) => l.owner.name, hideOnMobile: true },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (l) => date(l.createdAt), hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title={translate("Leads")}
        description="Potential deals to qualify and convert."
        actions={can('lead.create') && <Button icon={Plus} onClick={() => setCreating(true)}>{translate("New lead")}</Button>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder={translate("Search title, contact, company…")} className="sm:w-80" />
          <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={enumOptions(LEAD_STATUSES, enumLabel)} />
          <FilterSelect label="Source" value={lp.filters.source ?? ''} onChange={(v) => lp.setFilter('source', v)} options={enumOptions(LEAD_SOURCES, enumLabel)} />
        </Toolbar>
        <DataTable
          caption="Leads"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(l) => navigate(`/leads/${l.id}`)}
          empty={<EmptyState icon={Contact} title={translate("No leads found")} description="Adjust filters or create a new lead." />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      <LeadFormModal open={creating} onClose={() => setCreating(false)} onSaved={(l) => navigate(`/leads/${l.id}`)} />
    </div>
  );
}
