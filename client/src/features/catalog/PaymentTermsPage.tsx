import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAction } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, NumberInput } from '../../components/ui/Form';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { ListPageSkeleton } from '../../components/ui/Spinner';
import { api, errorMessage } from '../../lib/api';
import type { PaymentTerm } from '../../lib/types';
import { translate } from '../../i18n';

function TermForm({ term, onClose }: { term?: PaymentTerm; onClose: () => void }) {
  const [name, setName] = useState(term?.name ?? '');
  const [days, setDays] = useState(String(term?.days ?? 30));
  const [isActive, setIsActive] = useState(term?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const save = useAction((body: unknown) => (term ? api.patch(`/payment-terms/${term.id}`, body) : api.post('/payment-terms', body)), {
    invalidate: ['payment-terms'],
    success: term ? 'Payment term updated' : 'Payment term added',
    silentError: true,
  });
  const submit = async () => {
    setError(null);
    const d = Number(days);
    if (!name.trim()) return setError('Name is required');
    if (!Number.isInteger(d) || d < 0 || d > 365) return setError('Days must be a whole number from 0 to 365');
    try {
      await save.mutateAsync({ name: name.trim(), days: d, isActive });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={term ? `Edit ${term.name}` : 'New payment term'}
      description={term ? 'Changing the days affects invoices issued from now on; issued invoices keep their due dates.' : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={submit} loading={save.isPending}>{translate("Save")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Name" required hint="e.g. Net 30, COD"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Days until due" required hint="0 means payment on delivery (COD)."><NumberInput decimals={0} maxValue={365} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Checkbox label="Available for new customers" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </div>
    </Modal>
  );
}

export default function PaymentTermsPage() {
  const [editing, setEditing] = useState<PaymentTerm | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PaymentTerm | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payment-terms', 'all'],
    queryFn: async () => (await api.get<{ data: PaymentTerm[] }>('/payment-terms', { all: true })).data,
  });
  const remove = useAction((id: string) => api.delete(`/payment-terms/${id}`), { invalidate: ['payment-terms'], success: 'Payment term deleted' });

  if (isLoading) return <ListPageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={translate("Payment terms")}
        description="Terms you offer customers. A customer's term sets the due date of their invoices; customers without one use the system default."
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>{translate("New term")}</Button>}
      />
      <Card bodyClassName="p-0">
        {!data?.length ? (
          <EmptyState icon={CalendarDays} title={translate("No payment terms")} />
        ) : (
          <table className="table-base w-full">
            <thead>
              <tr><th>{translate("Term")}</th><th className="text-right">{translate("Days")}</th><th className="text-right">{translate("Customers")}</th><th>{translate("Status")}</th><th /></tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td className="tabular text-right">{t.days === 0 ? 'On delivery' : t.days}</td>
                  <td className="tabular text-right">{t.customerCount ?? 0}</td>
                  <td>{t.isActive ? <Badge tone="green">{translate("Active")}</Badge> : <Badge>{translate("Inactive")}</Badge>}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="size-4" /></button>
                      <button
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                        onClick={() => setDeleting(t)}
                        disabled={!!t.customerCount}
                        title={t.customerCount ? 'In use by customers. Deactivate it instead.' : undefined}
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && <TermForm term={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message="This term is not used by any customer. Terms used on invoices cannot be deleted; deactivate them instead."
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
