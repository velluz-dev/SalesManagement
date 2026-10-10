import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CalendarCheck, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { ACTIVITY_TYPES, enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useList } from '../../hooks/useApi';
import { Card } from '../../components/ui/Layout';
import { Button } from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '../../components/ui/Form';
import { Badge } from '../../components/ui/Badge';
import { api, errorMessage } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Activity } from '../../lib/types';

type Link = { customerId?: string; leadId?: string; opportunityId?: string };

export function ActivityFormModal({ open, onClose, link }: { open: boolean; onClose: () => void; link?: Link }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { type: 'CALL', subject: '', description: '', dueAt: '' } });
  const create = useAction((body: unknown) => api.post('/activities', body), { invalidate: ['activities'], success: 'Activity added', silentError: true });
  const onSubmit = async (v: { type: string; subject: string; description: string; dueAt: string }) => {
    setError(null);
    if (!v.subject.trim()) return setError('Subject is required');
    try {
      await create.mutateAsync({
        type: v.type,
        subject: v.subject.trim(),
        description: v.description || null,
        dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null,
        ...link,
      });
      reset();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New activity"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>Add activity</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Type"><Select {...register('type')}>{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{enumLabel(t)}</option>)}</Select></Field>
        <Field label="Due"><Input type="datetime-local" {...register('dueAt')} /></Field>
        <Field label="Subject" required className="sm:col-span-2"><Input {...register('subject')} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea {...register('description')} /></Field>
      </form>
    </Modal>
  );
}

export function ActivityRow({ a, canManage }: { a: Activity; canManage: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const toggle = useAction(() => api.patch(`/activities/${a.id}`, { completed: !a.completedAt }), { invalidate: ['activities'] });
  const remove = useAction(() => api.delete(`/activities/${a.id}`), { invalidate: ['activities'], success: 'Activity deleted' });
  const overdue = !a.completedAt && a.dueAt && new Date(a.dueAt) < new Date();
  return (
    <li className="flex items-start gap-3 py-3">
      <button
        disabled={!canManage || toggle.isPending}
        onClick={() => toggle.mutate(undefined)}
        className="mt-0.5 text-slate-400 hover:text-emerald-600 disabled:hover:text-slate-400"
        aria-label={a.completedAt ? 'Mark as open' : 'Mark as completed'}
      >
        {a.completedAt ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', a.completedAt && 'text-slate-400 line-through')}>{a.subject}</p>
        <p className="text-xs text-slate-500">
          <Badge className="mr-1.5">{enumLabel(a.type)}</Badge>
          {a.dueAt && <span className={cn(overdue && 'font-medium text-rose-600')}>Due {dateTime(a.dueAt)}</span>}
          {a.owner && <span className="ml-2">{a.owner.name}</span>}
        </p>
        {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
      </div>
      {canManage && (
        <button onClick={() => setConfirm(true)} className="text-slate-300 hover:text-rose-600" aria-label="Delete activity">
          <Trash2 className="size-4" />
        </button>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Delete activity?" message={`"${a.subject}" will be permanently removed.`} tone="danger" confirmLabel="Delete" onConfirm={() => remove.mutateAsync(undefined)} />
    </li>
  );
}

export function ActivityPanel({ filter, link }: { filter: Link; link: Link }) {
  const { can, canAny } = useAuth();
  const [adding, setAdding] = useState(false);
  const enabled = canAny('activity.read.own', 'activity.read.team', 'activity.read.all');
  const { data } = useList<Activity>('activities', { ...filter, pageSize: 20, sort: 'dueAt', order: 'desc' }, { enabled });
  if (!enabled) return null;
  return (
    <Card
      title="Activities"
      actions={can('activity.manage') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Add</Button>}
    >
      {!data?.data.length ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarCheck className="size-4" /> No activities logged yet.</div>
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">{data.data.map((a) => <ActivityRow key={a.id} a={a} canManage={can('activity.manage')} />)}</ul>
      )}
      <ActivityFormModal open={adding} onClose={() => setAdding(false)} link={link} />
    </Card>
  );
}
