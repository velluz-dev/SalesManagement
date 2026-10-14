import { useState } from 'react';
import { CUSTOMER_TYPES } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { empty, date } from '../../lib/format';
import type { Customer } from '../../lib/types';
import { CustomerFormModal } from './CustomerForm';

export default function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const lp = useListParams<'isActive' | 'type'>({ sort: 'name', order: 'asc' });
  const { data, isLoading, isFetching, error, refetch } = useList<Customer>('customers', lp.query);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortKey: 'name',
      cell: (c) => (
        <div>
          <p className="font-medium text-slate-900">{c.name}</p>
          <p className="text-xs text-slate-500">{c.email ?? empty()}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (c) => enumLabel(c.type), hideOnMobile: true },
    { key: 'industry', header: 'Industry', cell: (c) => c.industry ?? empty(), hideOnMobile: true },
    { key: 'owner', header: 'Owner', cell: (c) => c.owner.name },
    { key: 'counts', header: 'Opps / Quotes', cell: (c) => `${c._count?.opportunities ?? 0} / ${c._count?.quotations ?? 0}`, hideOnMobile: true, align: 'center' },
    { key: 'status', header: 'Status', cell: (c) => (c.isActive ? <Badge tone="green">{translate("Active")}</Badge> : <Badge>{translate("Inactive")}</Badge>) },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt', cell: (c) => date(c.createdAt), hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title={translate("Customers")}
        description="Accounts you are responsible for."
        actions={can('customer.create') && <Button icon={Plus} onClick={() => setCreating(true)}>{translate("New customer")}</Button>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder={translate("Search name, email, industry…")} className="sm:w-80" />
          <FilterSelect
            label="Type"
            value={lp.filters.type ?? ''}
            onChange={(v) => lp.setFilter('type', v)}
            options={CUSTOMER_TYPES.map((t) => ({ value: t, label: enumLabel(t) }))}
          />
          <FilterSelect
            label="Status"
            value={lp.filters.isActive ?? ''}
            onChange={(v) => lp.setFilter('isActive', v)}
            options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
          />
        </Toolbar>
        <DataTable
          caption="Customers"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={<EmptyState icon={Users} title={translate("No customers found")} description={lp.q ? 'Try a different search.' : 'Create your first customer to get started.'} />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      <CustomerFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </div>
  );
}
