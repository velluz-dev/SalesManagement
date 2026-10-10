import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { SettingDefinition } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { useAction } from '../../hooks/useApi';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, Select } from '../../components/ui/Form';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import type { Role } from '../../lib/types';

interface ApprovalRule {
  id: string;
  name: string;
  minAmount: string;
  maxAmount: string | null;
  approverType: 'TEAM_MANAGER' | 'ROLE';
  approverRoleId: string;
  approverRole: { id: string; code: string; name: string };
  priority: number;
  isActive: boolean;
}

function SettingsForm({ definitions, values, editable }: { definitions: SettingDefinition[]; values: Record<string, unknown>; editable: boolean }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => setDraft(values), [values]);
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => values[k] !== v));
  const save = async () => {
    setError(null);
    try {
      await api.put('/settings', changed);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Card title="System settings" description="Business policies are configurable rather than hard-coded." actions={editable && <Button icon={Save} disabled={!Object.keys(changed).length} onClick={save}>Save settings</Button>}>
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {definitions.map((d) => (
          <div key={d.key}>
            {d.type === 'boolean' ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <Checkbox label={<span className="font-medium">{d.label}</span>} checked={Boolean(draft[d.key])} disabled={!editable} onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.checked }))} />
                <p className="mt-1 ml-6 text-xs text-slate-500">{d.description}</p>
              </div>
            ) : (
              <Field label={d.label} hint={d.description}>
                {d.type === 'enum' ? (
                  <Select value={String(draft[d.key] ?? '')} disabled={!editable} onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.value }))}>
                    {d.options.map((o) => <option key={o} value={o}>{d.optionLabels?.[o] ?? o}</option>)}
                  </Select>
                ) : d.type === 'number' ? (
                  <Input type="number" min={d.min} max={d.max} value={String(draft[d.key] ?? '')} disabled={!editable} onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.value === '' ? '' : Number(e.target.value) }))} />
                ) : (
                  <Input value={String(draft[d.key] ?? '')} disabled={!editable} onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.value }))} />
                )}
              </Field>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RuleForm({ rule, roles, onClose }: { rule?: ApprovalRule; roles: Role[]; onClose: () => void }) {
  const approverRoles = roles.filter((r) => r.permissions.includes('approval.decide'));
  const [v, setV] = useState({
    name: rule?.name ?? '',
    minAmount: rule?.minAmount ?? '0',
    maxAmount: rule?.maxAmount ?? '',
    approverType: rule?.approverType ?? 'ROLE',
    approverRoleId: rule?.approverRoleId ?? approverRoles[0]?.id ?? '',
    priority: String(rule?.priority ?? 0),
    isActive: rule?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useAction((body: unknown) => (rule ? api.put(`/approval-rules/${rule.id}`, body) : api.post('/approval-rules', body)), {
    invalidate: ['approval-rules'],
    success: 'Approval rule saved',
    silentError: true,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ ...v, maxAmount: v.maxAmount === '' ? null : v.maxAmount, priority: Number(v.priority) });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={rule ? 'Edit approval rule' : 'New approval rule'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save rule</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Name" required className="sm:col-span-2"><Input value={v.name} onChange={set('name')} /></Field>
        <Field label="Minimum amount (inclusive)" required><Input inputMode="decimal" value={v.minAmount} onChange={set('minAmount')} /></Field>
        <Field label="Maximum amount (exclusive)" hint="Leave empty for no upper limit."><Input inputMode="decimal" value={v.maxAmount} onChange={set('maxAmount')} /></Field>
        <Field label="Approver">
          <Select value={v.approverType} onChange={set('approverType')}>
            <option value="TEAM_MANAGER">Requester's team manager</option>
            <option value="ROLE">Any holder of a role</option>
          </Select>
        </Field>
        <Field label="Approver role" hint="Only roles with approval authority are listed.">
          <Select value={v.approverRoleId} onChange={set('approverRoleId')}>{approverRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        </Field>
        <Field label="Priority" hint="Higher wins when ranges overlap."><Input type="number" min={0} max={1000} value={v.priority} onChange={set('priority')} /></Field>
        <div className="flex items-end pb-2"><Checkbox label="Active" checked={v.isActive} onChange={(e) => setV((x) => ({ ...x, isActive: e.target.checked }))} /></div>
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const editable = can('settings.manage');
  const [editingRule, setEditingRule] = useState<ApprovalRule | 'new' | null>(null);
  const [deletingRule, setDeletingRule] = useState<ApprovalRule | null>(null);
  const settings = useQuery({ queryKey: ['settings', 'all'], queryFn: async () => (await api.get<{ data: { definitions: SettingDefinition[]; values: Record<string, unknown> } }>('/settings')).data });
  const rules = useQuery({ queryKey: ['approval-rules'], queryFn: async () => (await api.get<{ data: ApprovalRule[] }>('/approval-rules')).data });
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<{ data: Role[] }>('/roles')).data, enabled: can('role.read') });
  const removeRule = useAction((id: string) => api.delete(`/approval-rules/${id}`), { invalidate: ['approval-rules'], success: 'Rule deleted' });

  if (settings.isLoading || rules.isLoading) return <FullPageSpinner />;
  if (settings.error || !settings.data) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="System configuration and quotation approval routing." />
      <SettingsForm definitions={settings.data.definitions} values={settings.data.values} editable={editable} />
      <Card
        title="Quotation approval rules"
        description="The rule whose amount range contains the quotation total decides who must approve it."
        actions={editable && roles.data && <Button size="sm" icon={Plus} onClick={() => setEditingRule('new')}>Add rule</Button>}
        bodyClassName="p-0"
      >
        <div className="relative overflow-x-auto">
          <table className="table-base w-full min-w-[640px]">
            <thead><tr><th>Rule</th><th>Amount range</th><th>Approver</th><th className="text-center">Priority</th><th>Status</th>{editable && <th />}</tr></thead>
            <tbody>
              {rules.data?.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="tabular">{money(r.minAmount)} to {r.maxAmount ? `under ${money(r.maxAmount)}` : 'no limit'}</td>
                  <td>{r.approverType === 'TEAM_MANAGER' ? `Team manager (${r.approverRole.name})` : `Any ${r.approverRole.name}`}</td>
                  <td className="text-center">{r.priority}</td>
                  <td>{r.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  {editable && (
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        {roles.data && <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditingRule(r)} aria-label={`Edit ${r.name}`}><Pencil className="size-4" /></button>}
                        <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeletingRule(r)} aria-label={`Delete ${r.name}`}><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!rules.data?.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No rules yet. Quotations can't be submitted until you add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editingRule && roles.data && <RuleForm rule={editingRule === 'new' ? undefined : editingRule} roles={roles.data} onClose={() => setEditingRule(null)} />}
      <ConfirmDialog
        open={!!deletingRule}
        onClose={() => setDeletingRule(null)}
        title="Delete approval rule?"
        message="Quotations in this amount range cannot be submitted until another rule covers it. Existing requests keep their history."
        tone="danger"
        confirmLabel="Delete rule"
        onConfirm={() => removeRule.mutateAsync(deletingRule!.id)}
      />
    </div>
  );
}
