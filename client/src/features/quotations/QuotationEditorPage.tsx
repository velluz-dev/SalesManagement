import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useDetail } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Field, FormError, Input, Textarea } from '../../components/ui/Form';
import { CustomerSelect, OpportunitySelect } from '../../components/ui/Pickers';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState, EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { emptyLine, itemsPayload, LineItemsEditor, validateItems, type LineItemValues, type WithItems } from '../../components/LineItemsEditor';
import { useAuth } from '../../auth/AuthProvider';
import type { Quotation } from '../../lib/types';

interface Values extends WithItems {
  customerId: string;
  opportunityId: string;
  validUntil: string;
  notes: string;
  terms: string;
}

function Editor({ quotation }: { quotation?: Quotation }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { settings } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const defaultTax = String(settings?.['quotation.defaultTaxRate'] ?? 0);

  const form = useForm<Values>({
    defaultValues: quotation
      ? {
          customerId: quotation.customerId,
          opportunityId: quotation.opportunityId ?? '',
          validUntil: quotation.validUntil.slice(0, 10),
          notes: quotation.notes ?? '',
          terms: quotation.terms ?? '',
          items: (quotation.items ?? []).map((i) => ({
            productId: i.productId ?? '',
            description: i.description,
            quantity: String(Number(i.quantity)),
            unitPrice: i.unitPrice,
            discountPercent: String(Number(i.discountPercent)),
            taxRate: String(Number(i.taxRate)),
          })),
        }
      : {
          customerId: params.get('customerId') ?? '',
          opportunityId: params.get('opportunityId') ?? '',
          validUntil: '',
          notes: '',
          terms: '',
          items: [emptyLine(defaultTax)],
        },
  });
  const { register, handleSubmit, control, setError: setFieldError, clearErrors, formState, setValue } = form;
  const customerId = useWatch({ control, name: 'customerId' });

  const onSubmit = async (v: Values) => {
    setError(null);
    clearErrors();
    const errs = validateItems(v.items as LineItemValues[]);
    if (!v.customerId) errs['customerId'] = 'Select a customer';
    if (Object.keys(errs).length) {
      for (const [k, m] of Object.entries(errs)) setFieldError(k as Path<Values>, { message: m });
      setError('Please correct the highlighted fields.');
      return;
    }
    const body = {
      customerId: v.customerId,
      opportunityId: v.opportunityId || null,
      ...(v.validUntil ? { validUntil: v.validUntil } : {}),
      notes: v.notes || null,
      terms: v.terms || null,
      items: itemsPayload(v.items),
    };
    try {
      const res = quotation
        ? await api.patch<{ data: Quotation }>(`/quotations/${quotation.id}`, body)
        : await api.post<{ data: Quotation }>('/quotations', body);
      await qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(quotation ? 'Quotation saved' : `Quotation ${res.data.number} created`);
      navigate(`/quotations/${res.data.id}`);
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as Path<Values>, { message: m });
      setError(errorMessage(e));
    }
  };

  const currency = quotation?.currency ?? settings?.['company.currency'];

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        back={quotation ? { to: `/quotations/${quotation.id}`, label: `${quotation.number} v${quotation.version}` } : { to: '/quotations', label: 'Quotations' }}
        title={quotation ? `Edit ${quotation.number}` : 'New quotation'}
        description={quotation?.status === 'REJECTED' ? 'This quotation was rejected. Revise it and resubmit for approval.' : 'Draft quotations can be edited until they are submitted for approval.'}
        actions={<Button type="submit" icon={Save} loading={formState.isSubmitting}>{quotation ? 'Save changes' : 'Save draft'}</Button>}
      />
      <div className="space-y-6">
        <FormError message={error} />
        <Card title="Customer & terms">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Customer" required error={formState.errors.customerId?.message}>
              <CustomerSelect {...register('customerId', { onChange: () => setValue('opportunityId', '') })} />
            </Field>
            <Field label="Opportunity" error={formState.errors.opportunityId?.message}>
              <OpportunitySelect customerId={customerId} disabled={!customerId} {...register('opportunityId')} />
            </Field>
            <Field label="Valid until" hint="Defaults to the configured validity period." error={formState.errors.validUntil?.message}>
              <Input type="date" {...register('validUntil')} />
            </Field>
          </div>
        </Card>
        <Card title="Line items">
          <LineItemsEditor
            setValue={setValue as never}
            control={control as never}
            register={register as never}
            errors={formState.errors as never}
            currency={currency}
            defaultTaxRate={defaultTax}
          />
        </Card>
        <Card title="Notes">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Notes to customer"><Textarea rows={4} {...register('notes')} /></Field>
            <Field label="Terms & conditions"><Textarea rows={4} {...register('terms')} /></Field>
          </div>
        </Card>
      </div>
    </form>
  );
}

export default function QuotationEditorPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useDetail<Quotation>(['quotations', id], `/quotations/${id}`, { enabled: !!id });
  if (!id) return <Editor />;
  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  if (!['DRAFT', 'REJECTED'].includes(data.status)) {
    return <EmptyState title="This quotation is read-only" description="Only draft or rejected quotations can be edited. Use “Revise” to create a new version." />;
  }
  return <Editor quotation={data} />;
}
