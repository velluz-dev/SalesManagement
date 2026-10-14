import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, CheckCircle2, Receipt, Truck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { DetailPageSkeleton } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { date, dateTime, money } from '../../lib/format';
import type { SalesOrder } from '../../lib/types';
import { translate } from '../../i18n';

export default function SalesOrderDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<'confirm' | 'deliver' | 'cancel' | null>(null);
  const { data: o, isLoading, error, refetch } = useDetail<SalesOrder>(['sales-orders', id], `/sales-orders/${id}`);
  const confirm = useAction(() => api.post<{ data: SalesOrder }>(`/sales-orders/${id}/confirm`), {
    invalidate: ['sales-orders', 'contracts'],
    silentError: true,
    onSuccess: (r) => {
      toast.success('Order confirmed');
      r.data.warnings?.forEach((w) => toast.error(`Credit warning: ${w}`));
    },
  });
  const deliver = useAction(() => api.post(`/sales-orders/${id}/deliver`), { invalidate: ['sales-orders'], success: 'Order marked as delivered', silentError: true });
  const cancel = useAction((reason: string) => api.post(`/sales-orders/${id}/cancel`, { reason }), { invalidate: ['sales-orders', 'contracts'], success: 'Order cancelled', silentError: true });

  if (isLoading) return <DetailPageSkeleton />;
  if (error || !o) return <ErrorState error={error} onRetry={refetch} />;
  const update = can('order.update');
  const activeInvoice = o.invoices?.find((i) => i.status !== 'CANCELLED');
  const cur = o.currency;

  return (
    <div>
      <PageHeader
        back={{ to: '/sales-orders', label: 'Sales orders' }}
        title={o.number}
        badge={<StatusBadge status={o.status} />}
        description={<><Link to={`/customers/${o.customer.id}`} className="hover:underline">{o.customer.name}</Link> · Owner: {o.owner.name}</>}
        actions={
          <>
            {update && (o.status === 'PENDING' || o.status === 'CONFIRMED') && !activeInvoice && <Button variant="ghost" icon={Ban} onClick={() => setDialog('cancel')}>{translate("Cancel order")}</Button>}
            {update && o.status === 'PENDING' && <Button icon={CheckCircle2} onClick={() => setDialog('confirm')}>{translate("Confirm order")}</Button>}
            {update && o.status === 'CONFIRMED' && <Button variant="success" icon={Truck} onClick={() => setDialog('deliver')}>{translate("Mark delivered")}</Button>}
            {can('invoice.create') && (o.status === 'CONFIRMED' || o.status === 'DELIVERED') && !activeInvoice && (
              <ButtonLink to={`/invoices/new?salesOrderId=${o.id}`} icon={Receipt}>{translate("Create invoice")}</ButtonLink>
            )}
          </>
        }
      />
      {o.status === 'CANCELLED' && o.cancelReason && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Cancelled: “{o.cancelReason}”</div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Line items")} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="table-base w-full min-w-[640px]">
                <thead><tr><th>{translate("Item")}</th><th className="text-right">{translate("Qty")}</th><th className="text-right">{translate("Unit price")}</th><th className="text-right">{translate("Disc.")}</th><th className="text-right">{translate("Tax")}</th><th className="text-right">{translate("Total")}</th></tr></thead>
                <tbody>
                  {o.items?.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.description}
                        {i.product && <span className="block font-mono text-xs text-slate-400">{i.product.code}</span>}
                      </td>
                      <td className="tabular text-right">{Number(i.quantity)}{i.product ? ` ${i.product.unit}` : ''}</td>
                      <td className="tabular text-right">{money(i.unitPrice, { currency: cur })}</td>
                      <td className="tabular text-right">{Number(i.discountPercent)}%</td>
                      <td className="tabular text-right">{Number(i.taxRate)}%</td>
                      <td className="tabular text-right font-medium">{money(i.lineTotal, { currency: cur })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="tabular ml-auto max-w-xs space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between text-slate-600"><dt>{translate("Subtotal")}</dt><dd>{money(o.subtotal, { currency: cur })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Discount")}</dt><dd>−{money(o.discountTotal, { currency: cur })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Tax")}</dt><dd>{money(o.taxTotal, { currency: cur })}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold"><dt>{translate("Total")}</dt><dd>{money(o.total, { currency: cur })}</dd></div>
            </dl>
          </Card>
        </div>
        <Card title={translate("Order details")}>
          <DescriptionList
            columns={1}
            items={[
              { label: 'Order date', value: date(o.orderDate) },
              { label: 'Delivery date', value: date(o.deliveryDate) },
              { label: 'Payment terms', value: o.paymentTerm ? o.paymentTerm.name : translate("Customer's default terms") },
              { label: 'Contract', value: o.contract ? <Link className="text-brand-600 hover:underline" to={`/contracts/${o.contract.id}`}>{o.contract.number}</Link> : 'None' },
              { label: 'Quotation', value: o.quotation ? <Link className="text-brand-600 hover:underline" to={`/quotations/${o.quotation.id}`}>{o.quotation.number} v{o.quotation.version}</Link> : 'Manual order' },
              { label: 'Confirmed', value: o.confirmedAt ? dateTime(o.confirmedAt) : 'Not yet' },
              { label: 'Invoice', value: activeInvoice ? (can('invoice.read') ? <Link className="text-brand-600 hover:underline" to={`/invoices/${activeInvoice.id}`}>{activeInvoice.number}</Link> : activeInvoice.number) : 'Not invoiced' },
              { label: 'Notes', value: o.notes ? <span className="whitespace-pre-wrap">{o.notes}</span> : null },
            ]}
          />
        </Card>
      </div>
      <ConfirmDialog
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title={translate("Confirm this order?")}
        message="A credit check runs against the customer’s limit and hold status. Confirmed orders can no longer be edited."
        confirmLabel="Confirm order"
        onConfirm={() => confirm.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={dialog === 'deliver'}
        onClose={() => setDialog(null)}
        title={translate("Mark as delivered?")}
        message="Records today as the delivery date."
        confirmLabel="Mark delivered"
        tone="success"
        onConfirm={() => deliver.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={translate("Cancel this order?")}
        message="Cancelled orders stay on record and cannot be reopened."
        confirmLabel="Cancel order"
        tone="danger"
        reason="Cancellation reason"
        reasonRequired
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
    </div>
  );
}
