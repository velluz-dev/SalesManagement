import { useState } from 'react';
import { enumLabel, translate } from '../../i18n';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useDetail, useList } from '../../hooks/useApi';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { Badge, InvoiceStatusBadge, StatusBadge } from '../../components/ui/Badge';
import { DetailPageSkeleton, ListSkeleton } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { empty, date, money } from '../../lib/format';
import type { Customer, Invoice, Opportunity, Quotation } from '../../lib/types';
import { CustomerFormModal } from './CustomerForm';
import { ActivityPanel } from '../activities/ActivityPanel';

function MiniList<T extends { id: string }>({ rows, empty, render }: { rows?: T[]; empty: string; render: (r: T) => React.ReactNode }) {
  if (!rows) return <ListSkeleton rows={3} />;
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return <ul className="-my-2 divide-y divide-slate-100">{rows.map((r) => <li key={r.id} className="py-2">{render(r)}</li>)}</ul>;
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can, canAny } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data: c, isLoading, error, refetch } = useDetail<Customer>(['customers', id], `/customers/${id}`);
  const canOpps = canAny('opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all');
  const canQuotes = canAny('quotation.read.own', 'quotation.read.team', 'quotation.read.all');
  const opps = useList<Opportunity>('opportunities', { customerId: id, pageSize: 10 }, { enabled: canOpps });
  const quotes = useList<Quotation>('quotations', { customerId: id, pageSize: 10 }, { enabled: canQuotes });
  const invoices = useList<Invoice>('invoices', { customerId: id, pageSize: 10 }, { enabled: can('invoice.read') });

  if (isLoading) return <DetailPageSkeleton />;
  if (error || !c) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div>
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
        title={c.name}
        badge={c.isActive ? <Badge tone="green">{translate("Active")}</Badge> : <Badge>{translate("Inactive")}</Badge>}
        description={[c.industry, `Owner: ${c.owner.name}`].filter(Boolean).join('. ')}
        actions={
          <>
            {can('customer.update') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{translate("Edit")}</Button>}
            {can('quotation.create') && <ButtonLink to={`/quotations/new?customerId=${c.id}`} icon={Plus}>{translate("New quotation")}</ButtonLink>}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={translate("Details")}>
            <DescriptionList
              items={[
                { label: 'Email', value: c.email },
                { label: 'Phone', value: c.phone },
                { label: 'Type', value: enumLabel(c.type) },
                { label: 'Industry', value: c.industry },
                { label: 'Tax ID', value: c.taxId },
                { label: 'Address', value: c.address },
                { label: 'Customer since', value: date(c.createdAt) },
              ]}
            />
          </Card>
          {canOpps && (
            <Card title={translate("Opportunities")}>
              <MiniList
                rows={opps.data?.data}
                empty="No opportunities yet."
                render={(o) => (
                  <Link to={`/opportunities/${o.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                    <span className="truncate">{o.name}</span>
                    <span className="flex items-center gap-3"><StatusBadge status={o.stage} /><span className="tabular">{money(o.amount)}</span></span>
                  </Link>
                )}
              />
            </Card>
          )}
          <ActivityPanel filter={{ customerId: c.id }} link={{ customerId: c.id }} />
          {canQuotes && (
            <Card title={translate("Quotations")}>
              <MiniList
                rows={quotes.data?.data}
                empty="No quotations yet."
                render={(q) => (
                  <Link to={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                    <span>{q.number} v{q.version}</span>
                    <span className="flex items-center gap-3"><StatusBadge status={q.status} /><span className="tabular">{money(q.total, { currency: q.currency })}</span></span>
                  </Link>
                )}
              />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {c.account && (
            <Card
              title={translate("Account & credit")}
              actions={can('credit.read') && <Link to={`/credit?q=${encodeURIComponent(c.name)}`} className="text-sm font-medium text-brand-600">{translate("Manage")}</Link>}
            >
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Outstanding balance', value: <span className="tabular font-semibold">{money(c.account.outstanding)}</span> },
                  {
                    label: 'Overdue',
                    value: Number(c.account.overdue) > 0
                      ? <span className="tabular font-medium text-rose-600">{money(c.account.overdue)} ({translate('{count} invoices', { count: c.account.overdueInvoices })})</span>
                      : <span className="tabular">{money(0)}</span>,
                  },
                  { label: 'Credit limit', value: c.account.creditLimit ? money(c.account.creditLimit) : translate('Not set') },
                  { label: 'Available credit', value: c.account.available !== null ? <span className="tabular">{money(c.account.available)}</span> : translate('No limit') },
                  { label: 'Payment terms', value: c.paymentTerm ? `${c.paymentTerm.name} (${c.paymentTerm.days} days)` : translate('System default') },
                  { label: 'Status', value: c.account.onHold ? <Badge tone="red">{translate("On hold")}</Badge> : <Badge tone="green">{translate("Good standing")}</Badge> },
                ]}
              />
            </Card>
          )}
          {can('invoice.read') && (
            <Card title={translate("Invoices")}>
              <MiniList
                rows={invoices.data?.data}
                empty="No invoices yet."
                render={(i) => (
                  <Link to={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                    <span>{i.number}</span>
                    <span className="flex items-center gap-3"><InvoiceStatusBadge status={i.status} isOverdue={i.isOverdue} /><span className="tabular">{money(i.balance)}</span></span>
                  </Link>
                )}
              />
            </Card>
          )}
        </div>
      </div>
      <CustomerFormModal open={editing} onClose={() => setEditing(false)} customer={c} onSaved={() => refetch()} />
    </div>
  );
}
