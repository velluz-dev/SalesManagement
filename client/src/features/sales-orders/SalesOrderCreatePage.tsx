import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type Path } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, FileText, PenLine, Save } from 'lucide-react';
import { api, ApiError, errorMessage, type Paged } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Field, FormError, Input, Select, Textarea } from '../../components/ui/Form';
import { EmptyHint } from '../../components/ui/Pickers';
import { CustomerPicker } from '../customers/CustomerPicker';
import { useToast } from '../../components/ui/Toast';
import { emptyLine, itemsPayload, LineItemsEditor, validateItems, type WithItems } from '../../components/LineItemsEditor';
import { useAuth } from '../../auth/AuthProvider';
import { money, todayIso } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Contract, Quotation, SalesOrder } from '../../lib/types';
import { translate } from '../../i18n';

type Mode = 'contract' | 'quotation' | 'manual';

interface Values extends WithItems {
  contractId: string;
  quotationId: string;
  customerId: string;
  orderDate: string;
  deliveryDate: string;
  notes: string;
}

export default function SalesOrderCreatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { settings, canAny } = useAuth();
  const canContracts = canAny('contract.read.own', 'contract.read.team', 'contract.read.all');
  const [mode, setMode] = useState<Mode>(params.get('contractId') ? 'contract' : params.get('quotationId') ? 'quotation' : canContracts ? 'contract' : 'manual');
  const [error, setError] = useState<string | null>(null);

  const contracts = useQuery({
    queryKey: ['contracts', 'active-picker'],
    queryFn: async () => (await api.get<Paged<Contract>>('/contracts', { status: 'ACTIVE', pageSize: 100 })).data,
    enabled: canContracts,
  });
  const quotes = useQuery({
    queryKey: ['quotations', 'accepted-picker'],
    queryFn: async () => (await api.get<Paged<Quotation>>('/quotations', { status: 'ACCEPTED', pageSize: 100 })).data,
  });

  const form = useForm<Values>({
    defaultValues: {
      contractId: params.get('contractId') ?? '',
      quotationId: params.get('quotationId') ?? '',
      customerId: '',
      orderDate: todayIso(),
      deliveryDate: '',
      notes: '',
      items: [emptyLine(String(settings?.['quotation.defaultTaxRate'] ?? 0))],
    },
  });
  const { register, handleSubmit, control, setValue, setError: setFieldError, clearErrors, formState, watch } = form;
  const contract = contracts.data?.find((c) => c.id === watch('contractId'));
  const quote = quotes.data?.find((q) => q.id === watch('quotationId'));

  const onSubmit = async (v: Values) => {
    setError(null);
    clearErrors();
    const common = { orderDate: v.orderDate || undefined, deliveryDate: v.deliveryDate || null, notes: v.notes.trim() || null };
    let body: unknown;
    if (mode === 'contract') {
      if (!v.contractId) return setError('Select a contract');
      body = { contractId: v.contractId, ...common };
    } else if (mode === 'quotation') {
      if (!v.quotationId) return setError('Select an accepted quotation');
      body = { quotationId: v.quotationId, ...common };
    } else {
      const errs = validateItems(v.items);
      if (!v.customerId) errs['customerId'] = 'Select a customer';
      if (Object.keys(errs).length) {
        for (const [k, m] of Object.entries(errs)) setFieldError(k as Path<Values>, { message: m });
        return setError('Please correct the highlighted fields.');
      }
      body = { customerId: v.customerId, items: itemsPayload(v.items), ...common };
    }
    if (v.deliveryDate && v.orderDate && v.deliveryDate < v.orderDate) return setError('Delivery date cannot be before the order date');
    try {
      const res = await api.post<{ data: SalesOrder }>('/sales-orders', body);
      await qc.invalidateQueries({ queryKey: ['sales-orders'] });
      await qc.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(`Sales order ${res.data.number} created`);
      navigate(`/sales-orders/${res.data.id}`);
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as Path<Values>, { message: m });
      setError(errorMessage(e));
    }
  };

  const modes = [
    ...(canContracts ? [['contract', FileSignature, 'From a contract', 'Order against an active contract.'] as const] : []),
    ['quotation', FileText, 'From a quotation', 'Order the lines of an accepted quotation.'] as const,
    ['manual', PenLine, 'Manual order', 'Pick a customer and products yourself.'] as const,
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        back={{ to: '/sales-orders', label: 'Sales orders' }}
        title={translate("New sales order")}
        description="Orders start as pending. Confirm them to run the credit check, then mark them delivered and invoice them."
        actions={<Button type="submit" icon={Save} loading={formState.isSubmitting}>{translate("Create order")}</Button>}
      />
      <div className="space-y-6">
        <FormError message={error} />
        <div className={cn('grid grid-cols-1 gap-3', modes.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup" aria-label={translate("Order source")}>
          {modes.map(([value, Icon, title, desc]) => (
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

        {mode === 'contract' && (
          <Card title={translate("Contract")}>
            <Field label="Active contract" required hint={contracts.data && !contracts.data.length ? <EmptyHint text="There are no active contracts you can order against." action="Order from a quotation instead" onClick={() => setMode('quotation')} /> : 'The order copies the contract’s quotation lines; you can adjust quantities while it is pending.'}>
              <Select {...register('contractId')} disabled={contracts.isLoading}>
                <option value="">{contracts.isLoading ? 'Loading…' : 'Select a contract…'}</option>
                {contracts.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.number} · {c.title} ({money(c.value, { currency: c.currency })})</option>
                ))}
              </Select>
            </Field>
            {contract && <p className="mt-3 text-sm text-slate-600">{translate("Customer")} <strong>{contract.customer.name}</strong>, contract value <strong>{money(contract.value, { currency: contract.currency })}</strong>.</p>}
          </Card>
        )}
        {mode === 'quotation' && (
          <Card title={translate("Accepted quotation")}>
            <Field label="Quotation" required hint={quotes.data && !quotes.data.length ? <EmptyHint text="There are no accepted quotations you can order." action="Go to quotations" to="/quotations" /> : undefined}>
              <Select {...register('quotationId')} disabled={quotes.isLoading}>
                <option value="">{quotes.isLoading ? 'Loading…' : 'Select a quotation…'}</option>
                {quotes.data?.map((q) => (
                  <option key={q.id} value={q.id}>{q.number} v{q.version} · {q.customer.name} ({money(q.total, { currency: q.currency })})</option>
                ))}
              </Select>
            </Field>
            {quote && <p className="mt-3 text-sm text-slate-600">{translate("Customer")} <strong>{quote.customer.name}</strong>, total <strong>{money(quote.total, { currency: quote.currency })}</strong>.</p>}
          </Card>
        )}
        {mode === 'manual' && (
          <>
            <Card title={translate("Customer")}>
              <Field label="Customer" required error={formState.errors.customerId?.message} className="max-w-xl"><CustomerPicker {...register('customerId')} onCreated={(id) => setValue('customerId', id, { shouldValidate: true })} /></Field>
            </Card>
            <Card title={translate("Line items")}>
              <LineItemsEditor setValue={setValue as never} control={control as never} register={register as never} errors={formState.errors as never} currency={settings?.['company.currency']} defaultTaxRate={String(settings?.['quotation.defaultTaxRate'] ?? 0)} />
            </Card>
          </>
        )}
        <Card title={translate("Delivery")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Order date"><Input type="date" {...register('orderDate')} /></Field>
            <Field label="Requested delivery date"><Input type="date" {...register('deliveryDate')} /></Field>
            <Field label="Notes" className="md:col-span-3"><Textarea rows={3} {...register('notes')} /></Field>
          </div>
        </Card>
      </div>
    </form>
  );
}
