import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { OPPORTUNITY_STAGES } from '@shared';
import { enumLabel, translate } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { EMPTY, date, dateTime, money } from '../../lib/format';
import type { Opportunity } from '../../lib/types';
import { OpportunityFormModal } from './OpportunityForm';
import { ActivityPanel } from '../activities/ActivityPanel';

export default function OpportunityDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data: o, isLoading, error, refetch } = useDetail<Opportunity>(['opportunities', id], `/opportunities/${id}`);
  const move = useAction((stage: string) => api.patch(`/opportunities/${id}`, { stage }), {
    invalidate: ['opportunities'],
    success: 'Stage updated',
  });

  if (isLoading) return <FullPageSpinner />;
  if (error || !o) return <ErrorState error={error} onRetry={refetch} />;
  const currentIdx = OPPORTUNITY_STAGES.indexOf(o.stage as never);

  return (
    <div>
      <PageHeader
        back={{ to: '/opportunities', label: 'Pipeline' }}
        title={o.name}
        badge={<StatusBadge status={o.stage} />}
        description={<><Link to={`/customers/${o.customer.id}`} className="hover:underline">{o.customer.name}</Link>, owned by {o.owner.name}</>}
        actions={
          <>
            {can('opportunity.update') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{translate("Edit")}</Button>}
            {can('quotation.create') && o.stage !== 'CLOSED_LOST' && (
              <ButtonLink to={`/quotations/new?customerId=${o.customerId}&opportunityId=${o.id}`} icon={Plus}>{translate("Create quotation")}</ButtonLink>
            )}
          </>
        }
      />

      {can('opportunity.update') && (
        <nav aria-label={translate("Stage")} className="card mb-6 flex overflow-x-auto p-1.5">
          {OPPORTUNITY_STAGES.map((s, i) => (
            <button
              key={s}
              disabled={move.isPending || s === o.stage}
              onClick={() => move.mutate(s)}
              aria-current={s === o.stage ? 'step' : undefined}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
                s === o.stage
                  ? s === 'CLOSED_LOST' ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white'
                  : i < currentIdx && o.stage !== 'CLOSED_LOST' ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'text-slate-500 hover:bg-slate-100',
              )}
            >
              {enumLabel(s)}
            </button>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Details")}>
            <DescriptionList
              items={[
                { label: 'Amount', value: money(o.amount) },
                { label: 'Probability', value: `${o.probability}%` },
                { label: 'Weighted value', value: money((Number(o.amount) * o.probability) / 100) },
                { label: 'Expected close', value: date(o.expectedCloseDate) },
                { label: 'Closed at', value: o.closedAt ? dateTime(o.closedAt) : EMPTY },
                { label: 'Source lead', value: o.lead ? <Link className="text-brand-600 hover:underline" to={`/leads/${o.lead.id}`}>{o.lead.title}</Link> : EMPTY },
              ]}
            />
            {o.notes && <p className="mt-5 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">{o.notes}</p>}
          </Card>
          <ActivityPanel filter={{ opportunityId: o.id }} link={{ opportunityId: o.id, customerId: o.customerId }} />
        </div>
        <Card title={translate("Quotations")}>
          {!o.quotations?.length ? (
            <p className="text-sm text-slate-500">{translate("No quotations linked yet.")}</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {o.quotations.map((q) => (
                <li key={q.id}>
                  <Link to={`/quotations/${q.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:underline">
                    {q.number} v{q.version}
                    <span className="flex items-center gap-2"><StatusBadge status={q.status} /><span className="tabular">{money(q.total)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <OpportunityFormModal open={editing} onClose={() => setEditing(false)} opportunity={o} onSaved={() => refetch()} />
    </div>
  );
}
