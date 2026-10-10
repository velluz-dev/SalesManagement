import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { LEAD_SOURCES, LEAD_STATUSES, enumLabel } from '@shared';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, Select, Textarea } from '../../components/ui/Form';
import { UserSelect } from '../../components/ui/Pickers';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import type { Lead } from '../../lib/types';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160),
  contactName: z.string().trim().min(1, 'Contact name is required').max(120),
  company: z.string().max(160),
  email: z.union([z.literal(''), z.email('Invalid email')]),
  phone: z.string().max(40),
  source: z.enum(LEAD_SOURCES),
  status: z.enum(LEAD_STATUSES),
  estimatedValue: z.string().refine((v) => v === '' || /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Enter an amount, e.g. 25000'),
  notes: z.string().max(2000),
  ownerId: z.string(),
});
type Values = z.infer<typeof schema>;

export function LeadFormModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead?: Lead; onSaved?: (l: Lead) => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      title: lead?.title ?? '',
      contactName: lead?.contactName ?? '',
      company: lead?.company ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      source: (lead?.source as Values['source']) ?? 'WEBSITE',
      status: (lead?.status as Values['status']) ?? 'NEW',
      estimatedValue: lead?.estimatedValue ?? '',
      notes: lead?.notes ?? '',
      ownerId: lead?.ownerId ?? me?.user.id ?? '',
    },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    const { ownerId, ...rest } = v;
    const body = {
      ...rest,
      company: rest.company || null,
      email: rest.email || null,
      phone: rest.phone || null,
      notes: rest.notes || null,
      estimatedValue: rest.estimatedValue || null,
      ...(can('lead.assign') && ownerId ? { ownerId } : {}),
    };
    try {
      const res = lead ? await api.patch<{ data: Lead }>(`/leads/${lead.id}`, body) : await api.post<{ data: Lead }>('/leads', body);
      await qc.invalidateQueries({ queryKey: ['leads'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(lead ? 'Lead updated' : 'Lead created');
      onSaved?.(res.data);
      onClose();
    } catch (e) {
      setError(applyServerErrors(e, setFieldError));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? 'Edit lead' : 'New lead'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{lead ? 'Save changes' : 'Create lead'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Title" error={formState.errors.title?.message} required className="sm:col-span-2"><Input {...register('title')} placeholder="e.g. Warehouse automation project" /></Field>
        <Field label="Contact name" error={formState.errors.contactName?.message} required><Input {...register('contactName')} /></Field>
        <Field label="Company" error={formState.errors.company?.message}><Input {...register('company')} /></Field>
        <Field label="Email" error={formState.errors.email?.message}><Input type="email" {...register('email')} /></Field>
        <Field label="Phone" error={formState.errors.phone?.message}><Input {...register('phone')} /></Field>
        <Field label="Source" error={formState.errors.source?.message}>
          <Select {...register('source')}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}</Select>
        </Field>
        <Field label="Status" error={formState.errors.status?.message}>
          <Select {...register('status')}>
            {LEAD_STATUSES.filter((s) => s !== 'CONVERTED').map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Estimated value" error={formState.errors.estimatedValue?.message}><Input inputMode="decimal" {...register('estimatedValue')} /></Field>
        {can('lead.assign') && (
          <Field label="Owner" error={formState.errors.ownerId?.message}><UserSelect {...register('ownerId')} /></Field>
        )}
        <Field label="Notes" error={formState.errors.notes?.message} className="sm:col-span-2"><Textarea rows={4} {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}
