import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, CheckCheck, ClipboardList, FileSignature, GitBranch, Pencil, Receipt, Send, ThumbsDown, Undo2, Mail } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { EMPTY, date, money } from '../../lib/format';
import type { Quotation } from '../../lib/types';
import { ApprovalTimeline } from '../approvals/ApprovalTimeline';
import { CreateContractModal } from '../contracts/ContractForms';
import { translate } from '../../i18n';

type ActionKey = 'submit' | 'withdraw' | 'send' | 'accept' | 'decline' | 'cancel' | 'revise';

export default function QuotationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState<ActionKey | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);
  const { data: q, isLoading, error, refetch } = useDetail<Quotation>(['quotations', id], `/quotations/${id}`);
  const run = useAction(
    async ({ key, comment }: { key: ActionKey; comment: string }) => {
      const body = comment ? { comment } : {};
      switch (key) {
        case 'accept':
        case 'decline':
          return api.post<{ data: Quotation }>(`/quotations/${id}/customer-response`, { outcome: key === 'accept' ? 'ACCEPTED' : 'DECLINED' });
        case 'send':
        case 'cancel':
          return api.post<{ data: Quotation }>(`/quotations/${id}/${key}`);
        default:
          return api.post<{ data: Quotation }>(`/quotations/${id}/${key}`, body);
      }
    },
    {
      invalidate: ['quotations', 'approvals', 'opportunities'],
      silentError: true,
      onSuccess: (r) => {
        if (r?.data && r.data.id !== id) navigate(`/quotations/${r.data.id}`);
      },
    },
  );

  if (isLoading) return <FullPageSpinner />;
  if (error || !q) return <ErrorState error={error} onRetry={refetch} />;

  const s = q.status;
  const canEdit = can('quotation.update') && (s === 'DRAFT' || s === 'REJECTED');
  const latestRejection = s === 'REJECTED' ? q.approvalRequests?.find((r) => r.status === 'REJECTED') : undefined;
  const activeInvoice = q.invoices?.find((i) => i.status !== 'CANCELLED');
  const hasOrders = !!q.salesOrders?.length;

  const dialogs: Record<ActionKey, { title: string; message: string; confirm: string; tone?: 'primary' | 'danger' | 'success'; reason?: string; reasonRequired?: boolean; success: string }> = {
    submit: { title: s === 'REJECTED' ? 'Resubmit for approval?' : 'Submit for approval?', message: `The approver is determined automatically from the approval rules for ${money(q.total, { currency: q.currency })}. The quotation will be locked while pending.`, confirm: 'Submit', reason: 'Comment for the approver (optional)', success: 'Submitted for approval' },
    withdraw: { title: 'Withdraw submission?', message: 'The approval request is cancelled and the quotation returns to draft.', confirm: 'Withdraw', reason: 'Reason (optional)', success: 'Submission withdrawn' },
    send: { title: 'Mark as sent to customer?', message: 'Record that this approved quotation has been sent to the customer.', confirm: 'Mark as sent', success: 'Marked as sent' },
    accept: { title: 'Record customer acceptance?', message: 'Finance can then invoice this quotation.', confirm: 'Customer accepted', tone: 'success', success: 'Marked as accepted' },
    decline: { title: 'Record customer decline?', message: 'You can still revise it into a new version later.', confirm: 'Customer declined', tone: 'danger', success: 'Marked as declined' },
    cancel: { title: 'Cancel quotation?', message: 'Cancelled quotations cannot be reopened.', confirm: 'Cancel quotation', tone: 'danger', success: 'Quotation cancelled' },
    revise: { title: 'Create a revision?', message: `A new draft version (v${q.version + 1}) is created from this one. This version becomes superseded and stays read-only for the record.`, confirm: 'Create revision', reason: 'Reason for revision (optional)', success: 'Revision created' },
  };
  const d = action ? dialogs[action] : null;

  return (
    <div>
      <PageHeader
        back={{ to: '/quotations', label: 'Quotations' }}
        title={<>{q.number} <span className="text-lg font-normal text-slate-400">v{q.version}</span></>}
        badge={<StatusBadge status={s} />}
        description={<><Link to={`/customers/${q.customer.id}`} className="hover:underline">{q.customer.name}</Link>, owned by {q.owner.name}</>}
        actions={
          <>
            {canEdit && <ButtonLink to={`/quotations/${q.id}/edit`} variant="secondary" icon={Pencil}>{translate("Edit")}</ButtonLink>}
            {canEdit && <Button variant="ghost" icon={Ban} onClick={() => setAction('cancel')}>{translate("Cancel")}</Button>}
            {can('quotation.submit') && (s === 'DRAFT' || s === 'REJECTED') && <Button icon={Send} onClick={() => setAction('submit')}>{s === 'REJECTED' ? 'Resubmit' : 'Submit for approval'}</Button>}
            {can('quotation.submit') && s === 'PENDING_APPROVAL' && <Button variant="secondary" icon={Undo2} onClick={() => setAction('withdraw')}>{translate("Withdraw")}</Button>}
            {can('quotation.update') && s === 'APPROVED' && <Button variant="secondary" icon={Mail} onClick={() => setAction('send')}>{translate("Mark as sent")}</Button>}
            {can('quotation.update') && (s === 'APPROVED' || s === 'SENT') && (
              <>
                <Button variant="success" icon={CheckCheck} onClick={() => setAction('accept')}>{translate("Accepted")}</Button>
                <Button variant="secondary" icon={ThumbsDown} onClick={() => setAction('decline')}>{translate("Declined")}</Button>
              </>
            )}
            {can('quotation.update') && ['APPROVED', 'SENT', 'DECLINED'].includes(s) && !activeInvoice && <Button variant="secondary" icon={GitBranch} onClick={() => setAction('revise')}>{translate("Revise")}</Button>}
            {can('contract.manage') && s === 'ACCEPTED' && !q.contract && !activeInvoice && (
              <Button variant="secondary" icon={FileSignature} onClick={() => setCreatingContract(true)}>{translate("Create contract")}</Button>
            )}
            {can('order.create') && s === 'ACCEPTED' && !activeInvoice && (
              <ButtonLink
                to={q.contract ? `/sales-orders/new?contractId=${q.contract.id}` : `/sales-orders/new?quotationId=${q.id}`}
                variant="secondary"
                icon={ClipboardList}
              >
                {translate("Create sales order")}
              </ButtonLink>
            )}
            {can('invoice.create') && (s === 'ACCEPTED' || s === 'APPROVED') && !activeInvoice && !hasOrders && <ButtonLink to={`/invoices/new?quotationId=${q.id}`} icon={Receipt}>{translate("Create invoice")}</ButtonLink>}
          </>
        }
      />

      {latestRejection && (
        <div role="alert" className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-medium">Rejected by {latestRejection.decidedBy?.name}</p>
          {latestRejection.decisionComment && <p className="mt-0.5">“{latestRejection.decisionComment}”</p>}
          <p className="mt-1 text-rose-700">{translate("Edit the quotation and resubmit it for approval.")}</p>
        </div>
      )}
      {s === 'SUPERSEDED' && q.revision && (
        <div className="mb-6 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          {translate("This version has been superseded by")} <Link className="font-medium underline" to={`/quotations/${q.revision.id}`}>v{q.revision.version}</Link> and is read-only.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Summary")}>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Issue date', value: date(q.issueDate) },
                { label: 'Valid until', value: date(q.validUntil) },
                { label: 'Currency', value: q.currency },
                { label: 'Opportunity', value: q.opportunity ? <Link className="text-brand-600 hover:underline" to={`/opportunities/${q.opportunity.id}`}>{q.opportunity.name}</Link> : EMPTY },
                { label: 'Previous version', value: q.parent ? <Link className="text-brand-600 hover:underline" to={`/quotations/${q.parent.id}`}>v{q.parent.version}</Link> : EMPTY },
                { label: 'Contract', value: q.contract ? <Link className="text-brand-600 hover:underline" to={`/contracts/${q.contract.id}`}>{q.contract.number}</Link> : EMPTY },
                {
                  label: 'Sales orders',
                  value: hasOrders
                    ? q.salesOrders!.map((o, i) => (
                        <span key={o.id}>{i > 0 && ', '}<Link className="text-brand-600 hover:underline" to={`/sales-orders/${o.id}`}>{o.number}</Link></span>
                      ))
                    : EMPTY,
                },
                { label: 'Invoice', value: activeInvoice ? (can('invoice.read') ? <Link className="text-brand-600 hover:underline" to={`/invoices/${activeInvoice.id}`}>{activeInvoice.number}</Link> : activeInvoice.number) : EMPTY },
              ]}
            />
          </Card>
          <Card title={translate("Line items")} bodyClassName="p-0">
            <div className="relative overflow-x-auto">
              <table className="table-base w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th>{translate("Description")}</th>
                    <th className="text-right">{translate("Qty")}</th>
                    <th className="text-right">{translate("Unit price")}</th>
                    <th className="text-right">{translate("Disc.")}</th>
                    <th className="text-right">{translate("Tax")}</th>
                    <th className="text-right">{translate("Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items?.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description}{i.product && <span className="block font-mono text-xs text-slate-400">{i.product.code}</span>}</td>
                      <td className="tabular text-right">{Number(i.quantity)}</td>
                      <td className="tabular text-right">{money(i.unitPrice, { currency: q.currency })}</td>
                      <td className="tabular text-right">{Number(i.discountPercent)}%</td>
                      <td className="tabular text-right">{Number(i.taxRate)}%</td>
                      <td className="tabular text-right font-medium">{money(i.lineTotal, { currency: q.currency })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="tabular ml-auto max-w-xs space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between text-slate-600"><dt>{translate("Subtotal")}</dt><dd>{money(q.subtotal, { currency: q.currency })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Discount")}</dt><dd>−{money(q.discountTotal, { currency: q.currency })}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>{translate("Tax")}</dt><dd>{money(q.taxTotal, { currency: q.currency })}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold"><dt>{translate("Total")}</dt><dd>{money(q.total, { currency: q.currency })}</dd></div>
            </dl>
          </Card>
          {(q.notes || q.terms) && (
            <Card title={translate("Notes & terms")}>
              <DescriptionList items={[{ label: 'Notes', value: <span className="whitespace-pre-wrap">{q.notes ?? EMPTY}</span> }, { label: 'Terms', value: <span className="whitespace-pre-wrap">{q.terms ?? EMPTY}</span> }]} />
            </Card>
          )}
        </div>
        <Card title={translate("Approval history")}>
          <ApprovalTimeline requests={q.approvalRequests ?? []} currency={q.currency} />
        </Card>
      </div>

      {creatingContract && (
        <CreateContractModal
          quotation={{ id: q.id, number: q.number, total: q.total, currency: q.currency, terms: q.terms, customer: q.customer }}
          onClose={() => setCreatingContract(false)}
        />
      )}
      {d && action && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title={d.title}
          message={d.message}
          confirmLabel={d.confirm}
          tone={d.tone}
          reason={d.reason}
          reasonRequired={d.reasonRequired}
          onConfirm={async (comment) => {
            await run.mutateAsync({ key: action, comment });
            toast.success(d.success);
          }}
        />
      )}
    </div>
  );
}
