import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Ban, Send, Wallet } from 'lucide-react';
import { PAYMENT_METHODS } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader, ProgressBar } from '../../components/ui/Layout';
import { Badge, InvoiceStatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Field, FormError, Input, NumberInput, Select, Textarea } from '../../components/ui/Form';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { EMPTY, date, dateTime, money, todayIso } from '../../lib/format';
import type { Invoice, Payment } from '../../lib/types';

function PaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({
    defaultValues: { amount: invoice.balance, method: 'BANK_TRANSFER', reference: '', paidAt: todayIso(), notes: '' },
  });
  const record = useAction((body: unknown) => api.post('/payments', body), { invalidate: ['invoices', 'payments', 'credit'], success: 'Payment recorded', silentError: true });
  const onSubmit = async (v: { amount: string; method: string; reference: string; paidAt: string; notes: string }) => {
    setError(null);
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.amount) || Number(v.amount) <= 0) return setError('Enter a valid amount greater than zero');
    if (Number(v.amount) > Number(invoice.balance)) return setError(`Amount cannot exceed the outstanding balance of ${money(invoice.balance, { currency: invoice.currency })}`);
    try {
      await record.mutateAsync({ invoiceId: invoice.id, amount: v.amount, method: v.method, reference: v.reference || null, paidAt: v.paidAt, notes: v.notes || null });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment for ${invoice.number}`}
      description={`Outstanding balance ${money(invoice.balance, { currency: invoice.currency })}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{translate("Record payment")}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Amount" required><NumberInput decimals={2} {...register('amount')} /></Field>
        <Field label="Payment date" required><Input type="date" max={todayIso()} {...register('paidAt')} /></Field>
        <Field label="Method"><Select {...register('method')}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{enumLabel(m)}</option>)}</Select></Field>
        <Field label="Reference"><Input placeholder={translate("Transaction / cheque no.")} {...register('reference')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<'issue' | 'cancel' | 'pay' | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const { data: inv, isLoading, error, refetch } = useDetail<Invoice>(['invoices', id], `/invoices/${id}`);
  const issue = useAction(() => api.post<{ data: Invoice }>(`/invoices/${id}/issue`), {
    invalidate: ['invoices', 'credit'],
    silentError: true,
    onSuccess: (r) => {
      toast.success('Invoice issued');
      r.data.warnings?.forEach((w) => toast.error(`Credit warning: ${w}`));
    },
  });
  const cancel = useAction((reason: string) => api.post(`/invoices/${id}/cancel`, { reason }), { invalidate: ['invoices', 'credit'], success: 'Invoice cancelled', silentError: true });
  const voidPayment = useAction(({ pid, reason }: { pid: string; reason: string }) => api.post(`/payments/${pid}/void`, { reason }), {
    invalidate: ['invoices', 'payments', 'credit'],
    success: 'Payment voided',
    silentError: true,
  });

  if (isLoading) return <FullPageSpinner />;
  if (error || !inv) return <ErrorState error={error} onRetry={refetch} />;
  const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID';
  const paidPct = Number(inv.total) > 0 ? (Number(inv.amountPaid) / Number(inv.total)) * 100 : 0;
  const credit = inv.customer.credit;

  return (
    <div>
      <PageHeader
        back={{ to: '/invoices', label: 'Invoices' }}
        title={inv.number}
        badge={<InvoiceStatusBadge status={inv.status} isOverdue={inv.isOverdue} />}
        description={<>{inv.customer.name}{inv.salesperson && <>, salesperson {inv.salesperson.name}</>}</>}
        actions={
          <>
            {can('invoice.cancel') && (inv.status === 'DRAFT' || (inv.status === 'ISSUED' && Number(inv.amountPaid) === 0)) && (
              <Button variant="ghost" icon={Ban} onClick={() => setDialog('cancel')}>{translate("Cancel invoice")}</Button>
            )}
            {can('invoice.update') && inv.status === 'DRAFT' && <Button icon={Send} onClick={() => setDialog('issue')}>{translate("Issue invoice")}</Button>}
            {can('payment.create') && open && <Button icon={Wallet} onClick={() => setDialog('pay')}>{translate("Record payment")}</Button>}
          </>
        }
      />

      {inv.isOverdue && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This invoice is {inv.daysOverdue} days overdue with {money(inv.balance, { currency: inv.currency })} outstanding.
        </div>
      )}
      {inv.status === 'CANCELLED' && inv.cancelReason && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Cancelled: “{inv.cancelReason}”</div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Invoice details")}>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Issue date', value: date(inv.issueDate) },
                { label: 'Due date', value: date(inv.dueDate) },
                { label: 'Currency', value: inv.currency },
                {
                  label: 'Source',
                  value: inv.salesOrder ? (
                    <Link className="text-brand-600 hover:underline" to={`/sales-orders/${inv.salesOrder.id}`}>Sales order {inv.salesOrder.number}</Link>
                  ) : inv.quotation ? (
                    <Link className="text-brand-600 hover:underline" to={`/quotations/${inv.quotation.id}`}>{inv.quotation.number} v{inv.quotation.version}</Link>
                  ) : (
                    'Manual'
                  ),
                },
                { label: 'Payment terms', value: inv.paymentTerm ? `${inv.paymentTerm.name} (${inv.paymentTerm.days} days)` : inv.issueDate ? 'System default' : 'Set when issued' },
                { label: 'Customer tax ID', value: inv.customer.taxId },
                { label: 'Created by', value: inv.createdBy?.name },
              ]}
            />
            {inv.notes && <p className="mt-5 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">{inv.notes}</p>}
          </Card>
          <Card title={translate("Line items")} bodyClassName="p-0">
            <div className="relative overflow-x-auto">
              <table className="table-base w-full min-w-[600px]">
                <thead><tr><th>{translate("Description")}</th><th className="text-right">{translate("Qty")}</th><th className="text-right">{translate("Unit price")}</th><th className="text-right">{translate("Disc.")}</th><th className="text-right">{translate("Tax")}</th><th className="text-right">{translate("Total")}</th></tr></thead>
                <tbody>
                  {inv.items?.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description}</td>
                      <td className="tabular text-right">{Number(i.quantity)}</td>
                      <td className="tabular text-right">{money(i.unitPrice, { currency: inv.currency })}</td>
                      <td className="tabular text-right">{Number(i.discountPercent)}%</td>
                      <td className="tabular text-right">{Number(i.taxRate)}%</td>
                      <td className="tabular text-right font-medium">{money(i.lineTotal, { currency: inv.currency })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="tabular ml-auto max-w-xs space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between text-slate-600"><dt>{translate("Subtotal")}</dt><dd>{money(inv.subtotal, { currency: inv.currency })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Discount")}</dt><dd>−{money(inv.discountTotal, { currency: inv.currency })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Tax")}</dt><dd>{money(inv.taxTotal, { currency: inv.currency })}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold"><dt>{translate("Total")}</dt><dd>{money(inv.total, { currency: inv.currency })}</dd></div>
            </dl>
          </Card>
          <Card title={translate("Payments")} bodyClassName="p-0">
            {!inv.payments?.length ? (
              <p className="px-5 py-4 text-sm text-slate-500">{translate("No payments recorded.")}</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="table-base w-full min-w-[600px]">
                  <thead><tr><th>{translate("Date")}</th><th>{translate("Method")}</th><th>{translate("Reference")}</th><th>{translate("Recorded by")}</th><th className="text-right">{translate("Amount")}</th><th /></tr></thead>
                  <tbody>
                    {inv.payments.map((p) => (
                      <tr key={p.id} className={p.voidedAt ? 'text-slate-400' : ''}>
                        <td>{date(p.paidAt)}</td>
                        <td>{enumLabel(p.method)}</td>
                        <td>{p.reference ?? EMPTY}</td>
                        <td>{p.recordedBy.name}</td>
                        <td className={`tabular text-right ${p.voidedAt ? 'line-through' : 'font-medium'}`}>{money(p.amount, { currency: inv.currency })}</td>
                        <td className="text-right">
                          {p.voidedAt ? (
                            <span title={`Voided by ${p.voidedBy?.name ?? 'unknown'} on ${dateTime(p.voidedAt)}${p.voidReason ? `: ${p.voidReason}` : ''}`}><Badge>{translate("Void")}</Badge></span>
                          ) : (
                            can('payment.void') && <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => setVoiding(p)}>{translate("Void")}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={translate("Balance")}>
            <p className="tabular text-3xl font-semibold">{money(inv.balance, { currency: inv.currency })}</p>
            <p className="mt-1 text-sm text-slate-500">outstanding of {money(inv.total, { currency: inv.currency })}</p>
            <ProgressBar value={paidPct} className="mt-4" label="Paid" />
            <p className="mt-1.5 text-xs text-slate-500">{money(inv.amountPaid, { currency: inv.currency })} paid ({Math.round(paidPct)}%)</p>
          </Card>
          {can('credit.read') && (
            <Card title={translate("Customer credit")}>
              {credit ? (
                <DescriptionList
                  columns={1}
                  items={[
                    { label: 'Credit limit', value: money(credit.creditLimit) },
                    { label: 'Terms', value: inv.customer.paymentTerm ? `${inv.customer.paymentTerm.name} (${inv.customer.paymentTerm.days} days)` : 'System default' },
                    { label: 'Status', value: credit.onHold ? <Badge tone="red">{translate("On hold")}</Badge> : <Badge tone="green">{translate("Good standing")}</Badge> },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-500">{translate("No credit terms set; default payment terms apply.")}</p>
              )}
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'issue'}
        onClose={() => setDialog(null)}
        title={translate("Issue invoice?")}
        message="The issue date is set to today and the due date is calculated from the customer's payment terms. Issued invoices can no longer be edited. A credit check is performed."
        confirmLabel="Issue invoice"
        onConfirm={() => issue.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={translate("Cancel invoice?")}
        message="Cancelled invoices remain on record but no longer count toward receivables."
        confirmLabel="Cancel invoice"
        tone="danger"
        reason="Cancellation reason"
        reasonRequired
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
      <ConfirmDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={translate("Void payment?")}
        message={voiding ? `Voiding ${money(voiding.amount, { currency: inv.currency })} re-opens that amount on the invoice. This is recorded in the audit log.` : ''}
        confirmLabel="Void payment"
        tone="danger"
        reason="Reason"
        reasonRequired
        onConfirm={(reason) => voidPayment.mutateAsync({ pid: voiding!.id, reason })}
      />
      {dialog === 'pay' && <PaymentModal invoice={inv} onClose={() => setDialog(null)} />}
    </div>
  );
}
