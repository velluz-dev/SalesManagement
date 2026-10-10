import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Info, X } from 'lucide-react';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { EMPTY, date, dateTime, money } from '../../lib/format';
import type { ApprovalRequest, Quotation } from '../../lib/types';
import { ApprovalTimeline } from './ApprovalTimeline';
import { translate } from '../../i18n';

export default function ApprovalDetailPage() {
  const { id = '' } = useParams();
  const { canAny } = useAuth();
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null);
  const { data: r, isLoading, error, refetch } = useDetail<ApprovalRequest>(['approvals', id], `/approvals/${id}`);
  const canSeeQuote = canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all');
  const quote = useQuery({
    queryKey: ['quotations', r?.quotationId],
    queryFn: async () => (await api.get<{ data: Quotation }>(`/quotations/${r!.quotationId}`)).data,
    enabled: !!r && canSeeQuote,
  });
  const decide = useAction((body: { decision: string; comment: string | null }) => api.post(`/approvals/${id}/decision`, body), {
    invalidate: ['approvals', 'quotations'],
    success: (_) => (decision === 'APPROVE' ? 'Quotation approved' : 'Quotation rejected'),
    silentError: true,
  });

  if (isLoading) return <FullPageSpinner />;
  if (error || !r) return <ErrorState error={error} onRetry={refetch} />;
  const q = quote.data;
  const currency = r.quotation?.currency;

  return (
    <div>
      <PageHeader
        back={{ to: '/approvals', label: 'Approvals' }}
        title={`Approval for ${r.quotation?.number} v${r.quotationVersion}`}
        badge={<StatusBadge status={r.status} />}
        description={`${r.quotation?.customer.name}, requested by ${r.requestedBy.name} on ${dateTime(r.createdAt)}`}
        actions={
          r.canDecide && (
            <>
              <Button variant="danger" icon={X} onClick={() => setDecision('REJECT')}>{translate("Reject")}</Button>
              <Button variant="success" icon={Check} onClick={() => setDecision('APPROVE')}>{translate("Approve")}</Button>
            </>
          )
        }
      />
      {r.status === 'PENDING' && !r.canDecide && r.decisionBlocker && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
          {r.decisionBlocker}.
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Request")}>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Amount (at submission)', value: <span className="tabular font-semibold">{money(r.amount, { currency })}</span> },
                { label: 'Rule', value: r.rule?.name ?? EMPTY },
                { label: 'Approver', value: r.assignedTo?.name ?? `Any ${r.approverRole.name}` },
                { label: 'Quotation owner', value: r.quotation?.owner.name },
                { label: 'Decided by', value: r.decidedBy?.name ?? EMPTY },
                { label: 'Decided at', value: r.decidedAt ? dateTime(r.decidedAt) : EMPTY },
              ]}
            />
          </Card>
          {q && (
            <Card
              title={translate("Quotation contents")}
              actions={<Link className="text-sm font-medium text-brand-600" to={`/quotations/${q.id}`}>{translate("Open quotation")}</Link>}
              bodyClassName="p-0"
            >
              <div className="relative overflow-x-auto">
                <table className="table-base w-full min-w-[560px]">
                  <thead>
                    <tr><th>{translate("Description")}</th><th className="text-right">{translate("Qty")}</th><th className="text-right">{translate("Unit price")}</th><th className="text-right">{translate("Disc.")}</th><th className="text-right">{translate("Total")}</th></tr>
                  </thead>
                  <tbody>
                    {q.items?.map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td>
                        <td className="tabular text-right">{Number(i.quantity)}</td>
                        <td className="tabular text-right">{money(i.unitPrice, { currency })}</td>
                        <td className="tabular text-right">{Number(i.discountPercent)}%</td>
                        <td className="tabular text-right font-medium">{money(i.lineTotal, { currency })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm text-slate-600">
                <span>Valid until {date(q.validUntil)}</span>
                <span className="tabular flex flex-wrap gap-x-4"><span>Discount −{money(q.discountTotal, { currency })}</span><span>Tax {money(q.taxTotal, { currency })}</span><strong className="text-slate-900">Total {money(q.total, { currency })}</strong></span>
              </div>
            </Card>
          )}
        </div>
        <Card title={translate("History")}>
          <ApprovalTimeline requests={[r]} currency={currency} />
        </Card>
      </div>
      {decision && (
        <ConfirmDialog
          open
          onClose={() => setDecision(null)}
          title={decision === 'APPROVE' ? 'Approve quotation?' : 'Reject quotation?'}
          message={
            decision === 'APPROVE'
              ? `Approve ${r.quotation?.number} for ${money(r.amount, { currency })}. Approved quotations become read-only.`
              : 'The requester will be notified with your reason and can revise and resubmit.'
          }
          confirmLabel={decision === 'APPROVE' ? 'Approve' : 'Reject'}
          tone={decision === 'APPROVE' ? 'success' : 'danger'}
          reason={decision === 'APPROVE' ? 'Comment (optional)' : 'Rejection reason'}
          reasonRequired={decision === 'REJECT'}
          onConfirm={async (comment) => {
            await decide.mutateAsync({ decision, comment: comment || null });
          }}
        />
      )}
    </div>
  );
}
