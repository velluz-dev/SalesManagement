import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAction } from '../../hooks/useApi';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, Textarea } from '../../components/ui/Form';
import { api, errorMessage } from '../../lib/api';
import { money, todayIso } from '../../lib/format';
import type { Contract } from '../../lib/types';
import { translate } from '../../i18n';

interface Values {
  title: string;
  startDate: string;
  endDate: string;
  documentUrl: string;
  terms: string;
}

const validUrl = (v: string) => !v || /^https?:\/\/\S+$/i.test(v.trim());

export function CreateContractModal({ quotation, onClose }: {
  quotation: { id: string; number: string; total: string; currency: string; terms: string | null; customer: { name: string } };
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({
    defaultValues: { title: `${quotation.customer.name} – ${quotation.number}`, startDate: todayIso(), endDate: '', documentUrl: '', terms: quotation.terms ?? '' },
  });
  const create = useAction((body: unknown) => api.post<{ data: Contract }>('/contracts', body), {
    invalidate: ['contracts', 'quotations'],
    success: (r) => `Contract ${r.data.number} created`,
    silentError: true,
  });
  const onSubmit = async (v: Values) => {
    setError(null);
    if (!v.startDate) return setError('Start date is required');
    if (v.endDate && v.endDate < v.startDate) return setError('End date must be on or after the start date');
    if (!validUrl(v.documentUrl)) return setError('Document link must start with http:// or https://');
    try {
      const res = await create.mutateAsync({
        quotationId: quotation.id,
        title: v.title.trim() || null,
        startDate: v.startDate,
        endDate: v.endDate || null,
        documentUrl: v.documentUrl.trim() || null,
        terms: v.terms.trim() || null,
      });
      onClose();
      navigate(`/contracts/${res.data.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={translate("Create contract")}
      description={`From ${quotation.number}. Contract value: ${money(quotation.total, { currency: quotation.currency })}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{translate("Create contract")}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Title" className="sm:col-span-2"><Input {...register('title')} /></Field>
        <Field label="Start date" required><Input type="date" {...register('startDate')} /></Field>
        <Field label="End date" hint="Leave empty for open-ended contracts."><Input type="date" {...register('endDate')} /></Field>
        <Field label="Signed document link" hint="Link to the signed copy (e.g. shared drive)" className="sm:col-span-2"><Input type="url" placeholder="https://" {...register('documentUrl')} /></Field>
        <Field label="Terms & conditions" className="sm:col-span-2"><Textarea rows={4} {...register('terms')} /></Field>
      </form>
    </Modal>
  );
}

export function EditContractModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Omit<Values, 'startDate'>>({
    defaultValues: { title: contract.title, endDate: contract.endDate?.slice(0, 10) ?? '', documentUrl: contract.documentUrl ?? '', terms: contract.terms ?? '' },
  });
  const save = useAction((body: unknown) => api.patch(`/contracts/${contract.id}`, body), { invalidate: ['contracts'], success: 'Contract updated', silentError: true });
  const onSubmit = async (v: Omit<Values, 'startDate'>) => {
    setError(null);
    if (!v.title.trim()) return setError('Title is required');
    if (!validUrl(v.documentUrl)) return setError('Document link must start with http:// or https://');
    try {
      await save.mutateAsync({ title: v.title.trim(), endDate: v.endDate || null, documentUrl: v.documentUrl.trim() || null, terms: v.terms.trim() || null });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${contract.number}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{translate("Save")}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Title" required className="sm:col-span-2"><Input {...register('title')} /></Field>
        <Field label="End date"><Input type="date" {...register('endDate')} /></Field>
        <Field label="Signed document link"><Input type="url" placeholder="https://" {...register('documentUrl')} /></Field>
        <Field label="Terms & conditions" className="sm:col-span-2"><Textarea rows={4} {...register('terms')} /></Field>
      </form>
    </Modal>
  );
}
