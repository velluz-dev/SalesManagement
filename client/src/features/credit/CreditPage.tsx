import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Pencil, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, ProgressBar, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, Textarea } from '../../components/ui/Form';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import type { CustomerCredit, UserRef } from '../../lib/types';

interface CreditRow {
  id: string;
  name: string;
  owner: UserRef;
  credit: CustomerCredit | null;
  exposure: string;
  overdue: string;
  available: string | null;
  utilization: number | null;
  overLimit: boolean;
}

function CreditForm({ row, onClose }: { row: CreditRow; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      creditLimit: row.credit?.creditLimit ?? '',
      paymentTermsDays: String(row.credit?.paymentTermsDays ?? 30),
      onHold: row.credit?.onHold ?? false,
      notes: row.credit?.notes ?? '',
    },
  });
  const save = useAction((body: unknown) => api.put(`/credit/${row.id}`, body), { invalidate: ['credit', 'customers'], success: 'Credit terms saved', silentError: true });
  const onSubmit = async (v: { creditLimit: string; paymentTermsDays: string; onHold: boolean; notes: string }) => {
    setError(null);
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.creditLimit)) return setError('Enter a valid credit limit');
    const days = Number(v.paymentTermsDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) return setError('Payment terms must be 0–365 days');
    try {
      await save.mutateAsync({ creditLimit: v.creditLimit, paymentTermsDays: days, onHold: v.onHold, notes: v.notes || null });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Credit terms · ${row.name}`}
      description={`Current exposure ${money(row.exposure)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Credit limit" required><Input inputMode="decimal" {...register('creditLimit')} /></Field>
        <Field label="Payment terms (days)" required><Input type="number" min={0} max={365} {...register('paymentTermsDays')} /></Field>
        <Checkbox className="sm:col-span-2" label="Place customer on credit hold" {...register('onHold')} />
        <Field label="Notes" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

export default function CreditPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<CreditRow | null>(null);
  const lp = useListParams<'onHold' | 'overLimit'>({ sort: 'name', order: 'asc' });
  const { data, isLoading, isFetching, error, refetch } = useList<CreditRow>('credit', lp.query);

  const columns: Column<CreditRow>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortKey: 'name',
      cell: (r) => (
        <div>
          <Link to={`/customers/${r.id}`} className="font-medium text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
          <p className="text-xs text-slate-500">{r.owner.name}</p>
        </div>
      ),
    },
    { key: 'limit', header: 'Limit', align: 'right', cell: (r) => <span className="tabular">{r.credit ? money(r.credit.creditLimit) : '—'}</span> },
    { key: 'exposure', header: 'Exposure', align: 'right', cell: (r) => <span className="tabular font-medium">{money(r.exposure)}</span> },
    { key: 'overdue', header: 'Overdue', align: 'right', cell: (r) => <span className={`tabular ${Number(r.overdue) > 0 ? 'font-medium text-rose-600' : ''}`}>{money(r.overdue)}</span>, hideOnMobile: true },
    {
      key: 'utilization',
      header: 'Utilization',
      className: 'w-44',
      hideOnMobile: true,
      cell: (r) =>
        r.utilization === null ? <span className="text-xs text-slate-400">No limit set</span> : (
          <div className="flex items-center gap-2"><ProgressBar value={100 - Math.min(100, r.utilization)} label="Available credit" /><span className="tabular w-12 text-right text-xs">{r.utilization}%</span></div>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.credit?.onHold && <Badge tone="red">On hold</Badge>}
          {r.overLimit && <Badge tone="amber">Over limit</Badge>}
          {!r.credit?.onHold && !r.overLimit && <Badge tone="green">OK</Badge>}
        </span>
      ),
    },
    ...(can('credit.manage')
      ? [{ key: 'edit', header: <span className="sr-only">Edit</span>, align: 'right' as const, cell: (r: CreditRow) => <button onClick={() => setEditing(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit credit for ${r.name}`}><Pencil className="size-4" /></button> }]
      : []),
  ];

  return (
    <div>
      <PageHeader title="Customer credit" description="Credit limits, terms and exposure from outstanding invoices." />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search customer…" className="sm:w-72" />
          <FilterSelect label="Hold" allLabel="Any" value={lp.filters.onHold ?? ''} onChange={(v) => lp.setFilter('onHold', v)} options={[{ value: 'true', label: 'On hold' }, { value: 'false', label: 'Not on hold' }]} />
          <FilterSelect label="Limit" allLabel="Any" value={lp.filters.overLimit ?? ''} onChange={(v) => lp.setFilter('overLimit', v)} options={[{ value: 'true', label: 'Over limit' }, { value: 'false', label: 'Within limit' }]} />
        </Toolbar>
        <DataTable
          caption="Customer credit"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          empty={<EmptyState icon={ShieldCheck} title="No customers found" />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      {editing && <CreditForm row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
