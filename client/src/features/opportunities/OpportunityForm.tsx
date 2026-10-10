import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { OPPORTUNITY_STAGES } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, NumberInput, Select, Textarea } from '../../components/ui/Form';
import { CustomerSelect, UserSelect } from '../../components/ui/Pickers';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import type { Opportunity } from '../../lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  customerId: z.string().min(1, 'Select a customer'),
  stage: z.enum(OPPORTUNITY_STAGES),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount, e.g. 25000'),
  probability: z.coerce.number<string>().int().min(0, 'Use 0 to 100').max(100, 'Use 0 to 100'),
  expectedCloseDate: z.string(),
  notes: z.string().max(2000),
  ownerId: z.string(),
});
type Values = z.input<typeof schema>;
type Output = z.output<typeof schema>;

const DEFAULT_PROBABILITY: Record<string, number> = { PROSPECTING: 10, QUALIFICATION: 25, PROPOSAL: 50, NEGOTIATION: 75, CLOSED_WON: 100, CLOSED_LOST: 0 };

export function OpportunityFormModal({ open, onClose, opportunity, defaultCustomerId, onSaved }: {
  open: boolean;
  onClose: () => void;
  opportunity?: Opportunity;
  defaultCustomerId?: string;
  onSaved?: (o: Opportunity) => void;
}) {
  const { can, me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, setError: setFieldError, formState } = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    values: {
      name: opportunity?.name ?? '',
      customerId: opportunity?.customerId ?? defaultCustomerId ?? '',
      stage: (opportunity?.stage as Values['stage']) ?? 'PROSPECTING',
      amount: opportunity?.amount ?? '',
      probability: String(opportunity?.probability ?? 10),
      expectedCloseDate: opportunity?.expectedCloseDate?.slice(0, 10) ?? '',
      notes: opportunity?.notes ?? '',
      ownerId: opportunity?.ownerId ?? me?.user.id ?? '',
    },
  });

  const onSubmit = async (v: Output) => {
    setError(null);
    const { ownerId, ...rest } = v;
    const body = {
      ...rest,
      expectedCloseDate: rest.expectedCloseDate || null,
      notes: rest.notes || null,
      ...(can('lead.assign') && ownerId ? { ownerId } : {}),
    };
    try {
      const res = opportunity
        ? await api.patch<{ data: Opportunity }>(`/opportunities/${opportunity.id}`, body)
        : await api.post<{ data: Opportunity }>('/opportunities', body);
      await qc.invalidateQueries({ queryKey: ['opportunities'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(opportunity ? 'Opportunity updated' : 'Opportunity created');
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
      title={opportunity ? 'Edit opportunity' : 'New opportunity'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{opportunity ? 'Save changes' : 'Create opportunity'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Name" error={formState.errors.name?.message} required className="sm:col-span-2"><Input {...register('name')} /></Field>
        <Field label="Customer" error={formState.errors.customerId?.message} required className="sm:col-span-2"><CustomerSelect {...register('customerId')} /></Field>
        <Field label="Stage" error={formState.errors.stage?.message}>
          <Select {...register('stage', { onChange: (e) => setValue('probability', String(DEFAULT_PROBABILITY[e.target.value] ?? 10)) })}>
            {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Amount" error={formState.errors.amount?.message} required><NumberInput decimals={2} {...register('amount')} /></Field>
        <Field label="Probability (%)" error={formState.errors.probability?.message}><NumberInput decimals={0} maxValue={100} {...register('probability')} /></Field>
        <Field label="Expected close date" error={formState.errors.expectedCloseDate?.message}><Input type="date" {...register('expectedCloseDate')} /></Field>
        {can('lead.assign') && <Field label="Owner"><UserSelect {...register('ownerId')} /></Field>}
        <Field label="Notes" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}
