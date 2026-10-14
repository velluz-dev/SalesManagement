import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type Path } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileText, PenLine, Save } from 'lucide-react';
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
import type { Invoice, Quotation, SalesOrder } from '../../lib/types';
import { translate } from '../../i18n';

interface Values extends WithItems {
  quotationId: string;
  salesOrderId: string;
  customerId: string;
  notes: string;
}

export default function InvoiceCreatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { settings, canAny } = useAuth();
  const canSeeOrders = canAny('order.read.own', 'order.read.team', 'order.read.all');
  const [mode, setMode] = useState<'quotation' | 'order' | 'manual'>(
    params.get('salesOrderId') ? 'order' : params.get('customerId') ? 'manual' : 'quotation',
  );
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

  const orders = useQuery({
    queryKey: ['sales-orders', 'invoiceable'],
    queryFn: async () => {
      const [confirmed, delivered] = await Promise.all([
        api.get<Paged<SalesOrder>>('/sales-orders', { status: 'CONFIRMED', pageSize: 100 }),
        api.get<Paged<SalesOrder>>('/sales-orders', { status: 'DELIVERED', pageSize: 100 }),
      ]);
      return [...confirmed.data, ...delivered.data];
    },
    enabled: canSeeOrders,
  });

  const form = useForm<Values>({
    defaultValues: { salesOrderId: params.get('salesOrderId') ?? '', quotationId: params.get('quotationId') ?? '', customerId: params.get('customerId') ?? '', notes: '', items: [emptyLine(String(settings?.['quotation.defaultTaxRate'] ?? 0))] },
  });
  const { register, handleSubmit, control, setError: setFieldError, clearErrors, formState, watch, setValue } = form;
  const selectedQuote = quotes.data?.find((q) => q.id === watch('quotationId'));
  const selectedOrder = orders.data?.find((o) => o.id === watch('salesOrderId'));

  const onSubmit = async (v: Values) => {
    setError(null);
    clearErrors();
    let body: unknown;
    if (mode === 'quotation') {
      if (!v.quotationId) return setError('Select a quotation to invoice');
      body = { quotationId: v.quotationId, notes: v.notes || null };
    } else if (mode === 'order') {
      if (!v.salesOrderId) return setError('Select a sales order to invoice');
      body = { salesOrderId: v.salesOrderId, notes: v.notes || null };
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
      await qc.invalidateQueries({ queryKey: ['sales-orders'] });
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
        title={translate("New invoice")}
        description="Invoices are created as drafts. Review, then issue them to start the payment terms."
        actions={<Button type="submit" icon={Save} loading={formState.isSubmitting}>{translate("Create draft")}</Button>}
      />
      <div className="space-y-6">
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={translate("Invoice source")}>
          {([
            ...(canSeeOrders ? [['order', ClipboardList, 'From a sales order', 'Bill a confirmed or delivered order.'] as const] : []),
            ['quotation', FileText, 'From a quotation', 'Copy line items from an approved or accepted quotation.'] as const,
            ['manual', PenLine, 'Manual invoice', 'Enter customer and line items yourself.'] as const,
          ]).map(([value, Icon, title, desc]) => (
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

        {mode === 'order' ? (
          <Card title={translate("Sales order")}>
            <Field label="Sales order" required hint={orders.data && !orders.data.length ? 'There are no confirmed or delivered orders to invoice.' : undefined}>
              <Select {...register('salesOrderId')} disabled={orders.isLoading}>
                <option value="">{orders.isLoading ? 'Loading…' : 'Select a sales order…'}</option>
                {orders.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number}, {o.customer.name}, {money(o.total, { currency: o.currency })} ({o.status.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            {selectedOrder && (
              <p className="mt-3 text-sm text-slate-600">
                {translate("Invoice for")} <strong>{selectedOrder.customer.name}</strong>, total <strong>{money(selectedOrder.total, { currency: selectedOrder.currency })}</strong>
                {selectedOrder.contract && <> under contract {selectedOrder.contract.number}</>}. The due date comes from the customer's payment terms when you issue it.
              </p>
            )}
          </Card>
        ) : mode === 'quotation' ? (
          <Card title={translate("Quotation")}>
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
                {translate("Invoice for")} <strong>{selectedQuote.customer.name}</strong>, total <strong>{money(selectedQuote.total, { currency: selectedQuote.currency })}</strong>, salesperson {selectedQuote.owner.name}.
              </p>
            )}
          </Card>
        ) : (
          <>
            <Card title={translate("Customer")}>
              <Field label="Customer" required error={formState.errors.customerId?.message} className="max-w-md"><CustomerSelect {...register('customerId')} /></Field>
            </Card>
            <Card title={translate("Line items")}>
              <LineItemsEditor setValue={setValue as never} control={control as never} register={register as never} errors={formState.errors as never} currency={settings?.['company.currency']} defaultTaxRate={String(settings?.['quotation.defaultTaxRate'] ?? 0)} />
            </Card>
          </>
        )}
        <Card title={translate("Notes")}>
          <Field label="Notes on invoice"><Textarea rows={3} {...register('notes')} /></Field>
        </Card>
      </div>
    </form>
  );
}
