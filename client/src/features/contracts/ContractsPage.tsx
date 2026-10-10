import { useNavigate } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import { CONTRACT_STATUSES } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { date, money } from '../../lib/format';
import type { Contract } from '../../lib/types';

export default function ContractsPage() {
  const navigate = useNavigate();
  const lp = useListParams<'status'>({ sort: 'createdAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<Contract>('contracts', lp.query);

  const columns: Column<Contract>[] = [
    {
      key: 'number',
      header: 'Contract',
      sortKey: 'number',
      cell: (c) => (
        <div>
          <p className="font-medium text-slate-900">{c.title}</p>
          <p className="text-xs text-slate-500">{c.number} · {c.customer.name}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'value', header: 'Value', sortKey: 'value', align: 'right', cell: (c) => <span className="tabular font-medium">{money(c.value, { currency: c.currency })}</span> },
    { key: 'start', header: 'Start', sortKey: 'startDate', cell: (c) => date(c.startDate), hideOnMobile: true },
    { key: 'end', header: 'End', sortKey: 'endDate', cell: (c) => (c.endDate ? date(c.endDate) : 'Open-ended'), hideOnMobile: true },
    { key: 'owner', header: 'Owner', cell: (c) => c.owner.name, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader title={translate("Contracts")} description="Agreements created from accepted quotations. Create one from an accepted quotation's page." />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder={translate("Search number, title, customer…")} className="sm:w-80" />
          <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={CONTRACT_STATUSES.map((s) => ({ value: s, label: enumLabel(s) }))} />
        </Toolbar>
        <DataTable
          caption="Contracts"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(c) => navigate(`/contracts/${c.id}`)}
          empty={<EmptyState icon={FileSignature} title={translate("No contracts yet")} description="When a customer accepts a quotation, open it and choose Create contract." />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
