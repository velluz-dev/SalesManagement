import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { PAYMENT_METHODS } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { EMPTY, date, money } from '../../lib/format';
import type { Payment } from '../../lib/types';

export default function PaymentsPage() {
  const lp = useListParams<'method' | 'includeVoided' | 'from' | 'to'>({ sort: 'paidAt' });
  const { data, isLoading, isFetching, error, refetch } = useList<Payment>('payments', lp.query);

  const columns: Column<Payment>[] = [
    { key: 'paidAt', header: 'Date', sortKey: 'paidAt', cell: (p) => date(p.paidAt) },
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (p) => (
        <div>
          <Link to={`/invoices/${p.invoiceId}`} className="font-medium text-brand-700 hover:underline">{p.invoice?.number}</Link>
          <p className="text-xs text-slate-500">{p.invoice?.customer.name}</p>
        </div>
      ),
    },
    { key: 'method', header: 'Method', cell: (p) => enumLabel(p.method), hideOnMobile: true },
    { key: 'reference', header: 'Reference', cell: (p) => p.reference ?? EMPTY, hideOnMobile: true },
    { key: 'recordedBy', header: 'Recorded by', cell: (p) => p.recordedBy.name, hideOnMobile: true },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      align: 'right',
      cell: (p) => (p.voidedAt ? <span className="flex items-center justify-end gap-2"><Badge>{translate("Void")}</Badge><span className="tabular text-slate-400 line-through">{money(p.amount)}</span></span> : <span className="tabular font-medium">{money(p.amount)}</span>),
    },
  ];

  return (
    <div>
      <PageHeader title={translate("Payments")} description="Customer payments recorded against invoices." />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder={translate("Search reference, invoice, customer…")} className="sm:w-80" />
          <FilterSelect label="Method" value={lp.filters.method ?? ''} onChange={(v) => lp.setFilter('method', v)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: enumLabel(m) }))} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {translate("From")} <input type="date" className="h-10 rounded-lg border border-slate-300 px-2" value={lp.filters.from ?? ''} onChange={(e) => lp.setFilter('from', e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {translate("To")} <input type="date" className="h-10 rounded-lg border border-slate-300 px-2" value={lp.filters.to ?? ''} onChange={(e) => lp.setFilter('to', e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="size-4 rounded border-slate-300" checked={lp.filters.includeVoided === 'true'} onChange={(e) => lp.setFilter('includeVoided', e.target.checked ? 'true' : '')} />
            {translate("Include voided")}
          </label>
        </Toolbar>
        <DataTable
          caption="Payments"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          empty={<EmptyState icon={Wallet} title={translate("No payments found")} />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
