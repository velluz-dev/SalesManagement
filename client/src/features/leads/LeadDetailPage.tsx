import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRightLeft, Pencil } from 'lucide-react';
import { enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useDetail } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input } from '../../components/ui/Form';
import { CustomerSelect } from '../../components/ui/Pickers';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { date, dateTime, money } from '../../lib/format';
import type { Lead } from '../../lib/types';
import { LeadFormModal } from './LeadForm';
import { ActivityPanel } from '../activities/ActivityPanel';

interface ConvertValues {
  mode: 'new' | 'existing';
  customerId: string;
  customerName: string;
  customerEmail: string;
  createOpportunity: boolean;
  opportunityName: string;
  amount: string;
  expectedCloseDate: string;
}

function ConvertModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState } = useForm<ConvertValues>({
    defaultValues: {
      mode: 'new',
      customerId: '',
      customerName: lead.company ?? lead.contactName,
      customerEmail: lead.email ?? '',
      createOpportunity: true,
      opportunityName: lead.title,
      amount: lead.estimatedValue ?? '',
      expectedCloseDate: '',
    },
  });
  const convert = useAction((body: unknown) => api.post<{ data: { customerId: string; opportunityId?: string } }>(`/leads/${lead.id}/convert`, body), {
    invalidate: ['leads', 'customers', 'opportunities', 'lookups'],
    success: 'Lead converted',
    silentError: true,
  });
  const mode = watch('mode');
  const createOpp = watch('createOpportunity');

  const onSubmit = async (v: ConvertValues) => {
    setError(null);
    if (mode === 'existing' && !v.customerId) return setError('Select a customer');
    if (createOpp && (!v.opportunityName.trim() || !/^\d+(\.\d{1,2})?$/.test(v.amount))) return setError('Enter an opportunity name and a valid amount');
    try {
      const res = await convert.mutateAsync({
        ...(mode === 'existing'
          ? { customerId: v.customerId }
          : { customer: { name: v.customerName.trim(), email: v.customerEmail || null } }),
        ...(createOpp
          ? { opportunity: { name: v.opportunityName.trim(), amount: v.amount, ...(v.expectedCloseDate ? { expectedCloseDate: v.expectedCloseDate } : {}) } }
          : {}),
      });
      onClose();
      navigate(res.data.opportunityId ? `/opportunities/${res.data.opportunityId}` : `/customers/${res.data.customerId}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert lead"
      description="Creates or links a customer and optionally an opportunity, in a single step."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={ArrowRightLeft} onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>Convert</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormError message={error} />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-900">Customer</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" value="new" {...register('mode')} /> Create new customer</label>
            <label className="flex items-center gap-2"><input type="radio" value="existing" {...register('mode')} /> Link existing customer</label>
          </div>
          {mode === 'new' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer name" required><Input {...register('customerName')} /></Field>
              <Field label="Email"><Input type="email" {...register('customerEmail')} /></Field>
            </div>
          ) : (
            <Field label="Existing customer" required><CustomerSelect {...register('customerId')} /></Field>
          )}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-900">Opportunity</legend>
          <Checkbox label="Create an opportunity" {...register('createOpportunity')} />
          {createOpp && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Name" required className="sm:col-span-3"><Input {...register('opportunityName')} /></Field>
              <Field label="Amount" required><Input inputMode="decimal" {...register('amount')} /></Field>
              <Field label="Expected close"><Input type="date" {...register('expectedCloseDate')} /></Field>
            </div>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

export default function LeadDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const { data: lead, isLoading, error, refetch } = useDetail<Lead>(['leads', id], `/leads/${id}`);

  if (isLoading) return <FullPageSpinner />;
  if (error || !lead) return <ErrorState error={error} onRetry={refetch} />;
  const converted = lead.status === 'CONVERTED';

  return (
    <div>
      <PageHeader
        back={{ to: '/leads', label: 'Leads' }}
        title={lead.title}
        badge={<StatusBadge status={lead.status} />}
        description={`${lead.contactName}${lead.company ? ` at ${lead.company}` : ''}, owned by ${lead.owner.name}`}
        actions={
          !converted && (
            <>
              {can('lead.update') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
              {can('lead.convert') && lead.status !== 'UNQUALIFIED' && <Button icon={ArrowRightLeft} onClick={() => setConverting(true)}>Convert</Button>}
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Lead details">
            <DescriptionList
              items={[
                { label: 'Contact', value: lead.contactName },
                { label: 'Company', value: lead.company },
                { label: 'Email', value: lead.email },
                { label: 'Phone', value: lead.phone },
                { label: 'Source', value: enumLabel(lead.source) },
                { label: 'Estimated value', value: money(lead.estimatedValue) },
                { label: 'Created', value: dateTime(lead.createdAt) },
                { label: 'Last updated', value: dateTime(lead.updatedAt) },
              ]}
            />
            {lead.notes && <p className="mt-5 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">{lead.notes}</p>}
          </Card>
          <ActivityPanel filter={{ leadId: lead.id }} link={{ leadId: lead.id }} />
        </div>
        {converted && (
          <Card title="Conversion">
            <p className="text-sm text-slate-600">
              Converted to{' '}
              {lead.convertedCustomer ? <Link className="font-medium text-brand-600" to={`/customers/${lead.convertedCustomer.id}`}>{lead.convertedCustomer.name}</Link> : 'a customer'}.
            </p>
            {lead.opportunities?.map((o) => (
              <Link key={o.id} to={`/opportunities/${o.id}`} className="mt-3 flex items-center justify-between text-sm hover:underline">
                {o.name} <StatusBadge status={o.stage} />
              </Link>
            ))}
            <p className="mt-3 text-xs text-slate-500">Converted leads are read-only. Created {date(lead.createdAt)}.</p>
          </Card>
        )}
      </div>
      <LeadFormModal open={editing} onClose={() => setEditing(false)} lead={lead} onSaved={() => refetch()} />
      {converting && <ConvertModal lead={lead} open onClose={() => setConverting(false)} />}
    </div>
  );
}
