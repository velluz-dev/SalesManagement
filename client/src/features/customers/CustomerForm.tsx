import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, Textarea } from '../../components/ui/Form';
import { UserSelect } from '../../components/ui/Pickers';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { applyServerErrors, clean } from '../../lib/forms';
import { useToast } from '../../components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer } from '../../lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(160),
  email: z.union([z.literal(''), z.email('Invalid email')]),
  phone: z.string().max(40),
  industry: z.string().max(80),
  address: z.string().max(400),
  taxId: z.string().max(60),
  ownerId: z.string(),
});
type Values = z.infer<typeof schema>;

export function CustomerFormModal({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer; onSaved?: (c: Customer) => void }) {
  const { can, me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      industry: customer?.industry ?? '',
      address: customer?.address ?? '',
      taxId: customer?.taxId ?? '',
      ownerId: customer?.ownerId ?? me?.user.id ?? '',
    },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const { ownerId, ...rest } = v;
      const body = customer
        ? { ...rest, email: rest.email || null, phone: rest.phone || null, industry: rest.industry || null, address: rest.address || null, taxId: rest.taxId || null, ...(can('lead.assign') ? { ownerId } : {}) }
        : { ...clean(rest), ...(can('lead.assign') && ownerId ? { ownerId } : {}) };
      const res = customer
        ? await api.patch<{ data: Customer }>(`/customers/${customer.id}`, body)
        : await api.post<{ data: Customer }>('/customers', body);
      await qc.invalidateQueries({ queryKey: ['customers'] });
      await qc.invalidateQueries({ queryKey: ['lookups'] });
      toast.success(customer ? 'Customer updated' : 'Customer created');
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
      title={customer ? 'Edit customer' : 'New customer'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{customer ? 'Save changes' : 'Create customer'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Customer name" error={formState.errors.name?.message} required className="sm:col-span-2">
          <Input {...register('name')} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}><Input type="email" {...register('email')} /></Field>
        <Field label="Phone" error={formState.errors.phone?.message}><Input {...register('phone')} /></Field>
        <Field label="Industry" error={formState.errors.industry?.message}><Input {...register('industry')} /></Field>
        <Field label="Tax ID" error={formState.errors.taxId?.message}><Input {...register('taxId')} /></Field>
        <Field label="Address" error={formState.errors.address?.message} className="sm:col-span-2"><Textarea {...register('address')} /></Field>
        {can('lead.assign') && (
          <Field label="Account owner" error={formState.errors.ownerId?.message} hint="You can assign customers to members of your team.">
            <UserSelect {...register('ownerId')} />
          </Field>
        )}
      </form>
    </Modal>
  );
}
