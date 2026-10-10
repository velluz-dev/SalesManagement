import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction } from '../../hooks/useApi';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, Select } from '../../components/ui/Form';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { useLookup } from '../../hooks/useApi';
import type { Team } from '../../lib/types';
import { translate } from '../../i18n';

function TeamForm({ team, onClose }: { team?: Team; onClose: () => void }) {
  const users = useLookup<{ id: string; name: string; email: string; teamId: string | null }>('users');
  const [name, setName] = useState(team?.name ?? '');
  const [managerId, setManagerId] = useState(team?.managerId ?? '');
  const [members, setMembers] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const save = useAction((body: unknown) => (team ? api.patch(`/teams/${team.id}`, body) : api.post('/teams', body)), {
    invalidate: ['teams', 'users', 'lookups'],
    success: team ? 'Team updated' : 'Team created',
    silentError: true,
  });
  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Team name is required');
    try {
      await save.mutateAsync({ name: name.trim(), managerId: managerId || null, memberIds: members });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={team ? `Edit ${team.name}` : 'New team'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{translate("Cancel")}</Button>
          <Button onClick={submit} loading={save.isPending}>{translate("Save team")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Team name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Manager" hint="Team quotations under the manager threshold route to this person.">
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">{translate("No manager")}</option>
              {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{translate("Members")} <span className="font-normal text-slate-500">(a user belongs to at most one team)</span></legend>
          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            {users.data?.map((u) => (
              <Checkbox
                key={u.id}
                label={<span>{u.name}{u.teamId && u.teamId !== team?.id && <span className="ml-1 text-xs text-amber-700">(moves from another team)</span>}</span>}
                checked={members.includes(u.id)}
                onChange={(e) => setMembers((m) => (e.target.checked ? [...m, u.id] : m.filter((x) => x !== u.id)))}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

export default function TeamsPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['teams'], queryFn: async () => (await api.get<{ data: Team[] }>('/teams')).data });
  const remove = useAction((id: string) => api.delete(`/teams/${id}`), { invalidate: ['teams', 'users', 'lookups'], success: 'Team deleted' });

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <div>
      <PageHeader
        title={translate("Teams")}
        description="Teams define a manager's data scope and approval routing."
        actions={can('team.manage') && <Button icon={Plus} onClick={() => setEditing('new')}>{translate("New team")}</Button>}
      />
      {!data?.length ? (
        <div className="card"><EmptyState icon={Network} title={translate("No teams yet")} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <Card
              key={t.id}
              title={t.name}
              description={t.manager ? `Manager: ${t.manager.name}` : 'No manager assigned'}
              actions={
                can('team.manage') && (
                  <div className="flex gap-1">
                    <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="size-4" /></button>
                    <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}><Trash2 className="size-4" /></button>
                  </div>
                )
              }
            >
              {!t.members.length ? (
                <p className="text-sm text-slate-500">{translate("No members.")}</p>
              ) : (
                <ul className="space-y-2">
                  {t.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm">
                      <span>{m.name}{m.id === t.managerId && <Badge tone="indigo" className="ml-2">{translate("Manager")}</Badge>}</span>
                      {!m.isActive && <Badge>{translate("Inactive")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && <TeamForm team={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message="Members are unassigned from the team. Their records and history are kept."
        tone="danger"
        confirmLabel="Delete team"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
