import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, CheckCheck, ExternalLink, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { DetailPageSkeleton } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { date, money } from '../../lib/format';
import type { Contract } from '../../lib/types';
import { EditContractModal } from './ContractForms';
import { translate } from '../../i18n';

export default function ContractDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<'edit' | 'complete' | 'cancel' | null>(null);
  const { data: c, isLoading, error, refetch } = useDetail<Contract>(['contracts', id], `/contracts/${id}`);
  const complete = useAction(() => api.post(`/contracts/${id}/complete`), { invalidate: ['contracts'], success: 'Contract completed', silentError: true });
  const cancel = useAction((reason: string) => api.post(`/contracts/${id}/cancel`, { reason }), { invalidate: ['contracts'], success: 'Contract cancelled', silentError: true });

  if (isLoading) return <DetailPageSkeleton />;
  if (error || !c) return <ErrorState error={error} onRetry={refetch} />;
  const active = c.status === 'ACTIVE';
  const manage = can('contract.manage') && active;

  return (
    <div>
      <PageHeader
        back={{ to: '/contracts', label: 'Contracts' }}
        title={c.title}
        badge={<StatusBadge status={c.status} />}
        description={<>{c.number} · <Link to={`/customers/${c.customer.id}`} className="hover:underline">{c.customer.name}</Link> · Owner: {c.owner.name}</>}
        actions={
          manage && (
            <>
              <Button variant="ghost" icon={Ban} onClick={() => setDialog('cancel')}>{translate("Cancel")}</Button>
              <Button variant="secondary" icon={Pencil} onClick={() => setDialog('edit')}>{translate("Edit")}</Button>
              <Button variant="secondary" icon={CheckCheck} onClick={() => setDialog('complete')}>{translate("Mark completed")}</Button>
              {can('order.create') && <ButtonLink to={`/sales-orders/new?contractId=${c.id}`} icon={Plus}>{translate("New sales order")}</ButtonLink>}
            </>
          )
        }
      />
      {c.status === 'CANCELLED' && c.cancelReason && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Cancelled: “{c.cancelReason}”</div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Contract details")}>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Value', value: <span className="tabular font-semibold">{money(c.value, { currency: c.currency })}</span> },
                { label: 'Start date', value: date(c.startDate) },
                { label: 'Payment terms', value: c.paymentTerm ? c.paymentTerm.name : translate("Customer's default terms") },
                { label: 'End date', value: c.endDate ? date(c.endDate) : 'Open-ended' },
                { label: 'Quotation', value: c.quotation ? <Link className="text-brand-600 hover:underline" to={`/quotations/${c.quotation.id}`}>{c.quotation.number} v{c.quotation.version}</Link> : null },
                {
                  label: 'Signed document',
                  value: c.documentUrl ? (
                    <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={c.documentUrl} target="_blank" rel="noopener noreferrer">
                      {translate("Open document")} <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    'Not attached'
                  ),
                },
                { label: 'Created by', value: c.createdBy?.name },
              ]}
            />
            {c.terms && <p className="mt-5 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">{c.terms}</p>}
          </Card>
        </div>
        <Card title={translate("Sales orders")}>
          {!c.orders?.length ? (
            <p className="text-sm text-slate-500">{translate("No orders under this contract yet.")}</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {c.orders.map((o) => (
                <li key={o.id}>
                  <Link to={`/sales-orders/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:underline">
                    <span>{o.number}<span className="block text-xs text-slate-500">{date(o.orderDate)}</span></span>
                    <span className="flex items-center gap-2"><StatusBadge status={o.status} /><span className="tabular">{money(o.total, { currency: c.currency })}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {dialog === 'edit' && <EditContractModal contract={c} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        title={translate("Mark contract as completed?")}
        message="Completed contracts are read-only and no new orders can be added."
        confirmLabel="Mark completed"
        onConfirm={() => complete.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={translate("Cancel contract?")}
        message="Only possible when every order under it is cancelled. The contract stays on record."
        confirmLabel="Cancel contract"
        tone="danger"
        reason="Cancellation reason"
        reasonRequired
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
    </div>
  );
}
