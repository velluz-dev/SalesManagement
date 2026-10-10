import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type Path } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, PenLine, Save } from 'lucide-react';
import { api, ApiError, errorMessage, type Paged } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Field, FormError, Select, Textarea } from '../../components/ui/Form';
import { CustomerSelect } from '../../components/ui/Pickers';
import { useToast } from '../../components/ui/Toast';
import { emptyLine, itemsPayload, LineItemsEditor, validateItems, type WithItems } from '../../components/LineItemsEditor';
import { useAuth } from '../../auth/AuthProvider';
import { money } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Invoice, Quotation } from '../../lib/types';

interface Values extends WithItems {
  quotationId: string;
  customerId: string;
  notes: string;
}

export default function InvoiceCreatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { settings } = useAuth();
  const [mode, setMode] = useState<'quotation' | 'manual'>(params.get('customerId') ? 'manual' : 'quotation');
  const [error, setError] = useState<string | null>(null);

  const quotes = useQuery({
    queryKey: ['quotations', 'invoiceable'],
    queryFn: async () => {
      const [acc, appr] = await Promise.all([
        api.get<Paged<Quotation>>('/quotations', { status: 'ACCEPTED', pageSize: 100 }),
        api.get<Paged<Quotation>>('/quotations', { status: 'APPROVED', pageSize: 100 }),
      ]);
      return [...acc.data, ...appr.data];
    },
  });

  const form = useForm<Values>({
    defaultValues: { quotationId: params.get('quotationId') ?? '', customerId: params.get('customerId') ?? '', notes: '', items: [emptyLine(String(settings?.['quotation.defaultTaxRate'] ?? 0))] },
  });
  const { register, handleSubmit, control, setError: setFieldError, clearErrors, formState, watch } = form;
  const selectedQuote = quotes.data?.find((q) => q.id === watch('quotationId'));

  const onSubmit = async (v: Values) => {
    setError(null);
    clearErrors();
    let body: unknown;
    if (mode === 'quotation') {
      if (!v.quotationId) return setError('Select a quotation to invoice');
      body = { quotationId: v.quotationId, notes: v.notes || null };
    } else {
      const errs = validateItems(v.items);
      if (!v.customerId) errs['customerId'] = 'Select a customer';
      if (Object.keys(errs).length) {
        for (const [k, m] of Object.entries(errs)) setFieldError(k as Path<Values>, { message: m });
        return setError('Please correct the highlighted fields.');
      }
      body = { customerId: v.customerId, notes: v.notes || null, items: itemsPayload(v.items) };
    }
    try {
      const res = await api.post<{ data: Invoice }>('/invoices', body);
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(`Draft invoice ${res.data.number} created`);
      navigate(`/invoices/${res.data.id}`);
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as Path<Values>, { message: m });
      setError(errorMessage(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        back={{ to: '/invoices', label: 'Invoices' }}
        title="New invoice"
        description="Invoices are created as drafts. Review, then issue them to start the payment terms."
        actions={<Button type="submit" icon={Save} loading={formState.isSubmitting}>Create draft</Button>}
      />
      <div className="space-y-6">
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Invoice source">
          {([
            ['quotation', FileText, 'From a quotation', 'Copy line items from an approved or accepted quotation.'],
            ['manual', PenLine, 'Manual invoice', 'Enter customer and line items yourself.'],
          ] as const).map(([value, Icon, title, desc]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn('card flex items-start gap-3 p-4 text-left transition', mode === value ? 'border-brand-500 ring-2 ring-brand-500/20' : 'hover:border-slate-300')}
            >
              <Icon className={cn('mt-0.5 size-5', mode === value ? 'text-brand-600' : 'text-slate-400')} />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === 'quotation' ? (
          <Card title="Quotation">
            <Field label="Quotation" required hint={quotes.data && !quotes.data.length ? 'There are no approved or accepted quotations to invoice.' : undefined}>
              <Select {...register('quotationId')} disabled={quotes.isLoading}>
                <option value="">{quotes.isLoading ? 'Loading…' : 'Select a quotation…'}</option>
                {quotes.data?.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.number} v{q.version}, {q.customer.name}, {money(q.total, { currency: q.currency })} ({q.status.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            {selectedQuote && (
              <p className="mt-3 text-sm text-slate-600">
                Invoice for <strong>{selectedQuote.customer.name}</strong>, total <strong>{money(selectedQuote.total, { currency: selectedQuote.currency })}</strong>, salesperson {selectedQuote.owner.name}.
              </p>
            )}
          </Card>
        ) : (
          <>
            <Card title="Customer">
              <Field label="Customer" required error={formState.errors.customerId?.message} className="max-w-md"><CustomerSelect {...register('customerId')} /></Field>
            </Card>
            <Card title="Line items">
              <LineItemsEditor control={control as never} register={register as never} errors={formState.errors as never} currency={settings?.['company.currency']} defaultTaxRate={String(settings?.['quotation.defaultTaxRate'] ?? 0)} />
            </Card>
          </>
        )}
        <Card title="Notes">
          <Field label="Notes on invoice"><Textarea rows={3} {...register('notes')} /></Field>
        </Card>
      </div>
    </form>
  );
}
