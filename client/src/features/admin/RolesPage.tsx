import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, Save } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { cn } from '../../lib/cn';
import type { Role } from '../../lib/types';
import { translate } from '../../i18n';

interface PermissionGroup {
  group: string;
  permissions: { code: string; description: string }[];
}

export default function RolesPage() {
  const { can, me } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<{ data: Role[] }>('/roles')).data });
  const catalogue = useQuery({ queryKey: ['roles', 'permissions'], queryFn: async () => (await api.get<{ data: PermissionGroup[] }>('/roles/permissions')).data, staleTime: Infinity });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const role = useMemo(() => roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0], [roles.data, selectedId]);

  useEffect(() => {
    if (role) setDraft(new Set(role.permissions));
  }, [role]);

  const save = useAction((permissions: string[]) => api.patch(`/roles/${role!.id}`, { permissions }), { invalidate: ['roles'], success: 'Role permissions updated' });

  if (roles.isLoading || catalogue.isLoading) return <FullPageSpinner />;
  if (roles.error || catalogue.error || !role) return <ErrorState error={roles.error ?? catalogue.error} onRetry={() => roles.refetch()} />;

  const ownRole = me?.roles.includes(role.code) ?? false;
  const editable = can('role.manage') && !ownRole;
  const dirty = draft.size !== role.permissions.length || role.permissions.some((p) => !draft.has(p));
  const added = [...draft].filter((p) => !role.permissions.includes(p));
  const removed = role.permissions.filter((p) => !draft.has(p));

  const toggle = (code: string) =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <div>
      <PageHeader title={translate("Roles & permissions")} description="Permissions are enforced by the API on every request; menus and buttons follow them automatically." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card title={translate("Roles")} bodyClassName="p-2">
          <ul className="space-y-1">
            {roles.data?.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={cn('w-full rounded-lg px-3 py-2.5 text-left transition-colors', r.id === role.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50')}
                  aria-current={r.id === role.id}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{r.name}</span>
                    <span className="text-xs text-slate-500">{r.userCount} users</span>
                  </span>
                  <span className="text-xs text-slate-500">{r.permissions.length} permissions</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title={<span className="flex items-center gap-2">{role.name} {role.isSystem && <Badge>{translate("System role")}</Badge>}</span>}
          description={role.description ?? undefined}
          actions={editable && <Button icon={Save} disabled={!dirty} onClick={() => setConfirm(true)}>{translate("Save changes")}</Button>}
        >
          {ownRole && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Lock className="mt-0.5 size-4 shrink-0" /> {translate("You hold this role, so you cannot change its permissions (prevents self-escalation).")}
            </div>
          )}
          <div className="space-y-6">
            {catalogue.data?.map((g) => (
              <fieldset key={g.group}>
                <legend className="mb-2 text-sm font-semibold text-slate-800">{g.group}</legend>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {g.permissions.map((p) => (
                    <label
                      key={p.code}
                      className={cn('flex items-start gap-3 rounded-lg border px-3 py-2', draft.has(p.code) ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200', editable ? 'cursor-pointer hover:border-brand-300' : 'cursor-default opacity-90')}
                    >
                      <input type="checkbox" className="mt-0.5 size-4 rounded border-slate-300" checked={draft.has(p.code)} disabled={!editable} onChange={() => toggle(p.code)} />
                      <span>
                        <span className="block text-sm text-slate-900">{p.description}</span>
                        <code className="text-xs text-slate-500">{p.code}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Update ${role.name}?`}
        message={
          <div className="space-y-2">
            <p>This affects {role.userCount} user(s) on their next request and is recorded in the audit log.</p>
            {added.length > 0 && <p><strong>{translate("Adding:")}</strong> <code className="text-xs">{added.join(', ')}</code></p>}
            {removed.length > 0 && <p><strong>{translate("Removing:")}</strong> <code className="text-xs">{removed.join(', ')}</code></p>}
          </div>
        }
        confirmLabel="Save permissions"
        onConfirm={() => save.mutateAsync([...draft])}
      />
    </div>
  );
}
