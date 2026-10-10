import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { QUOTATION_STATUSES, enumLabel } from '@crm/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { ButtonLink } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { enumOptions } from '../../components/ui/Pickers';
import { date, money } from '../../lib/format';
import type { Quotation } from '../../lib/types';

export default function QuotationsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const lp = useListParams<'status'>({ sort: 'createdAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<Quotation>('quotations', lp.query);

  const columns: Column<Quotation>[] = [
    {
      key: 'number',
      header: 'Quotation',
      sortKey: 'number',
      cell: (q) => (
        <div>
          <p className="font-medium text-slate-900">{q.number} <span className="text-xs font-normal text-slate-400">v{q.version}</span></p>
          <p className="text-xs text-slate-500">{q.customer.name}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (q) => <StatusBadge status={q.status} /> },
    { key: 'total', header: 'Total', sortKey: 'total', align: 'right', cell: (q) => <span className="tabular font-medium">{money(q.total, { currency: q.currency })}</span> },
    { key: 'validUntil', header: 'Valid until', sortKey: 'validUntil', cell: (q) => date(q.validUntil), hideOnMobile: true },
    { key: 'owner', header: 'Owner', cell: (q) => q.owner.name, hideOnMobile: true },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (q) => date(q.createdAt), hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Create, submit for approval and track quotations."
        actions={can('quotation.create') && <ButtonLink to="/quotations/new" icon={Plus}>New quotation</ButtonLink>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search number or customer…" className="sm:w-80" />
          <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={enumOptions(QUOTATION_STATUSES, enumLabel)} />
        </Toolbar>
        <DataTable
          caption="Quotations"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(q) => navigate(`/quotations/${q.id}`)}
          empty={<EmptyState icon={FileText} title="No quotations found" />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
