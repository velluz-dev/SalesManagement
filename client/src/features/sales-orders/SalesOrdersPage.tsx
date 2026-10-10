import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { SALES_ORDER_STATUSES, enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { ButtonLink } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { date, money } from '../../lib/format';
import type { SalesOrder } from '../../lib/types';

export default function SalesOrdersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const lp = useListParams<'status'>({ sort: 'createdAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<SalesOrder>('sales-orders', lp.query);

  const columns: Column<SalesOrder>[] = [
    {
      key: 'number',
      header: 'Order',
      sortKey: 'number',
      cell: (o) => (
        <div>
          <p className="font-medium text-slate-900">{o.number}</p>
          <p className="text-xs text-slate-500">{o.customer.name}{o.contract ? ` · ${o.contract.number}` : ''}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
    { key: 'orderDate', header: 'Ordered', sortKey: 'orderDate', cell: (o) => date(o.orderDate), hideOnMobile: true },
    { key: 'deliveryDate', header: 'Delivery', sortKey: 'deliveryDate', cell: (o) => date(o.deliveryDate), hideOnMobile: true },
    { key: 'total', header: 'Total', sortKey: 'total', align: 'right', cell: (o) => <span className="tabular font-medium">{money(o.total, { currency: o.currency })}</span> },
    { key: 'owner', header: 'Owner', cell: (o) => o.owner.name, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title="Sales orders"
        description="Orders to fulfil, from contracts, accepted quotations or entered directly."
        actions={can('order.create') && <ButtonLink to="/sales-orders/new" icon={Plus}>New order</ButtonLink>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search order number or customer…" className="sm:w-80" />
          <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={SALES_ORDER_STATUSES.map((s) => ({ value: s, label: enumLabel(s) }))} />
        </Toolbar>
        <DataTable
          caption="Sales orders"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(o) => navigate(`/sales-orders/${o.id}`)}
          empty={<EmptyState icon={ClipboardList} title="No sales orders found" />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
