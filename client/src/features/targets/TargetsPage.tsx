import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { TARGET_PERIOD_TYPES, enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, ProgressBar, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '../../components/ui/Form';
import { TeamSelect, UserSelect } from '../../components/ui/Pickers';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { date, money } from '../../lib/format';
import type { SalesTarget } from '../../lib/types';

interface TargetValues {
  assignee: 'user' | 'team';
  userId: string;
  teamId: string;
  periodType: 'MONTH' | 'QUARTER' | 'YEAR';
  year: string;
  period: string;
  amount: string;
  notes: string;
}

function periodIndex(t: SalesTarget) {
  const start = new Date(t.periodStart);
  return t.periodType === 'QUARTER' ? Math.floor(start.getUTCMonth() / 3) + 1 : start.getUTCMonth() + 1;
}

function TargetForm({ target, onClose }: { target?: SalesTarget; onClose: () => void }) {
  const { me } = useAuth();
  const now = new Date();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState } = useForm<TargetValues>({
    defaultValues: target
      ? {
          assignee: target.teamId ? 'team' : 'user',
          userId: target.userId ?? '',
          teamId: target.teamId ?? '',
          periodType: target.periodType,
          year: String(new Date(target.periodStart).getUTCFullYear()),
          period: String(periodIndex(target)),
          amount: target.amount,
          notes: target.notes ?? '',
        }
      : { assignee: 'user', userId: '', teamId: '', periodType: 'MONTH', year: String(now.getFullYear()), period: String(now.getMonth() + 1), amount: '', notes: '' },
  });
  const save = useAction((body: unknown) => (target ? api.put(`/targets/${target.id}`, body) : api.post('/targets', body)), {
    invalidate: ['targets'],
    success: target ? 'Target updated' : 'Target set',
    silentError: true,
  });
  const assignee = watch('assignee');
  const periodType = watch('periodType');

  const onSubmit = async (v: TargetValues) => {
    setError(null);
    if (assignee === 'user' && !v.userId) return setError('Select a salesperson');
    if (assignee === 'team' && !v.teamId) return setError('Select a team');
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.amount)) return setError('Enter a valid target amount');
    try {
      await save.mutateAsync({
        ...(assignee === 'user' ? { userId: v.userId } : { teamId: v.teamId }),
        periodType: v.periodType,
        year: Number(v.year),
        period: v.periodType === 'YEAR' ? 1 : Number(v.period),
        amount: v.amount,
        notes: v.notes || null,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
  return (
    <Modal
      open
      onClose={onClose}
      title={target ? 'Edit target' : 'Set sales target'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>Save target</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <fieldset className="flex gap-4 text-sm sm:col-span-2">
          <legend className="sr-only">Assign to</legend>
          <label className="flex items-center gap-2"><input type="radio" value="user" {...register('assignee')} /> Salesperson</label>
          <label className="flex items-center gap-2"><input type="radio" value="team" {...register('assignee')} /> Team</label>
        </fieldset>
        {assignee === 'user' ? (
          <Field label="Salesperson" required className="sm:col-span-2" hint="You cannot set your own target.">
            <UserSelect {...register('userId')} />
          </Field>
        ) : (
          <Field label="Team" required className="sm:col-span-2"><TeamSelect {...register('teamId')} /></Field>
        )}
        <Field label="Period type">
          <Select {...register('periodType')}>{TARGET_PERIOD_TYPES.map((p) => <option key={p} value={p}>{enumLabel(p)}</option>)}</Select>
        </Field>
        <Field label="Year"><Input type="number" min={2000} max={2100} {...register('year')} /></Field>
        {periodType !== 'YEAR' && (
          <Field label={periodType === 'QUARTER' ? 'Quarter' : 'Month'}>
            <Select {...register('period')}>
              {periodType === 'QUARTER'
                ? [1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)
                : months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Target amount" required><Input inputMode="decimal" {...register('amount')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
      </form>
      <p className="mt-3 text-xs text-slate-400">Set by {me?.user.name}. The assignee is notified.</p>
    </Modal>
  );
}

export default function TargetsPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<SalesTarget | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SalesTarget | null>(null);
  const year = new Date().getFullYear();
  const lp = useListParams<'year' | 'periodType' | 'current'>({ year: String(year) });
  const { data, isLoading, isFetching, error, refetch } = useList<SalesTarget>('targets', lp.query);
  const remove = useAction((id: string) => api.delete(`/targets/${id}`), { invalidate: ['targets'], success: 'Target removed' });

  const columns: Column<SalesTarget>[] = [
    {
      key: 'who',
      header: 'Assigned to',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{t.user?.name ?? t.team?.name}</span>
          {t.team && <Badge tone="purple">Team</Badge>}
        </div>
      ),
    },
    { key: 'period', header: 'Period', cell: (t) => <span>{enumLabel(t.periodType)}, {date(t.periodStart)} to {date(t.periodEnd)}</span>, hideOnMobile: true },
    { key: 'target', header: 'Target', align: 'right', cell: (t) => <span className="tabular">{money(t.amount)}</span> },
    { key: 'achieved', header: 'Achieved', align: 'right', cell: (t) => <span className="tabular">{money(t.achieved)}</span> },
    {
      key: 'progress',
      header: 'Progress',
      className: 'w-48',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={t.percent} label="Target progress" />
          <span className="tabular w-12 text-right text-xs font-medium">{t.percent}%</span>
        </div>
      ),
    },
    ...(can('target.manage')
      ? [{
          key: 'actions',
          header: <span className="sr-only">Actions</span>,
          align: 'right' as const,
          cell: (t: SalesTarget) => (
            <div className="flex justify-end gap-1">
              <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(t)} aria-label="Edit target"><Pencil className="size-4" /></button>
              <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(t)} aria-label="Delete target"><Trash2 className="size-4" /></button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Sales targets"
        description="Targets and achievement by salesperson and team."
        actions={can('target.manage') && <Button icon={Plus} onClick={() => setEditing('new')}>Set target</Button>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <FilterSelect label="Year" allLabel="All years" value={lp.filters.year ?? ''} onChange={(v) => lp.setFilter('year', v)} options={[year + 1, year, year - 1, year - 2].map((y) => ({ value: String(y), label: String(y) }))} />
          <FilterSelect label="Period" value={lp.filters.periodType ?? ''} onChange={(v) => lp.setFilter('periodType', v)} options={TARGET_PERIOD_TYPES.map((p) => ({ value: p, label: enumLabel(p) }))} />
          <FilterSelect label="Timing" allLabel="Any" value={lp.filters.current ?? ''} onChange={(v) => lp.setFilter('current', v)} options={[{ value: 'true', label: 'Current periods only' }]} />
        </Toolbar>
        <DataTable
          caption="Sales targets"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          empty={<EmptyState icon={Trophy} title="No targets" description="No targets match these filters." />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      {editing && <TargetForm target={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete target?"
        message="This target and its progress tracking will be removed."
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
