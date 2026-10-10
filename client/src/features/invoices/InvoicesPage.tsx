import { useNavigate } from 'react-router-dom';
import { AlarmClock, Plus, Receipt } from 'lucide-react';
import { INVOICE_STATUSES, enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { ButtonLink } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { InvoiceStatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { date, money } from '../../lib/format';
import type { Invoice } from '../../lib/types';

export default function InvoicesPage({ overdueOnly = false }: { overdueOnly?: boolean }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const lp = useListParams<'status' | 'unpaid'>({ sort: overdueOnly ? 'dueDate' : 'createdAt', order: overdueOnly ? 'asc' : 'desc' });
  const { data, isLoading, isFetching, error, refetch } = useList<Invoice>('invoices', { ...lp.query, ...(overdueOnly ? { overdue: true } : {}) });

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      sortKey: 'number',
      cell: (i) => (
        <div>
          <p className="font-medium text-slate-900">{i.number}</p>
          <p className="text-xs text-slate-500">{i.customer.name}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (i) => <InvoiceStatusBadge status={i.status} isOverdue={i.isOverdue} /> },
    { key: 'issueDate', header: 'Issued', sortKey: 'issueDate', cell: (i) => date(i.issueDate), hideOnMobile: true },
    {
      key: 'dueDate',
      header: 'Due',
      sortKey: 'dueDate',
      cell: (i) => (
        <span className={i.isOverdue ? 'font-medium text-rose-600' : ''}>
          {date(i.dueDate)}
          {i.isOverdue && <span className="block text-xs">{i.daysOverdue} days overdue</span>}
        </span>
      ),
    },
    { key: 'total', header: 'Total', sortKey: 'total', align: 'right', cell: (i) => <span className="tabular">{money(i.total, { currency: i.currency })}</span>, hideOnMobile: true },
    { key: 'balance', header: 'Balance', align: 'right', cell: (i) => <span className="tabular font-medium">{money(i.balance, { currency: i.currency })}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={overdueOnly ? 'Overdue invoices' : 'Invoices'}
        description={overdueOnly ? 'Issued invoices past their due date with an outstanding balance.' : 'Customer invoices and their payment status.'}
        actions={can('invoice.create') && !overdueOnly && <ButtonLink to="/invoices/new" icon={Plus}>New invoice</ButtonLink>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search invoice or customer…" className="sm:w-80" />
          {!overdueOnly && (
            <>
              <FilterSelect label="Status" value={lp.filters.status ?? ''} onChange={(v) => lp.setFilter('status', v)} options={INVOICE_STATUSES.map((s) => ({ value: s, label: s === 'ISSUED' ? 'Unpaid' : enumLabel(s) }))} />
              <FilterSelect label="Balance" allLabel="Any" value={lp.filters.unpaid ?? ''} onChange={(v) => lp.setFilter('unpaid', v)} options={[{ value: 'true', label: 'Outstanding only' }]} />
            </>
          )}
        </Toolbar>
        <DataTable
          caption="Invoices"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          empty={
            overdueOnly
              ? <EmptyState icon={AlarmClock} title="No overdue invoices" description="All issued invoices are within their payment terms." />
              : <EmptyState icon={Receipt} title="No invoices found" />
          }
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
