import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldCheck, UserCog, UserX, UserCheck, Pencil } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, PasswordInput, Select } from '../../components/ui/Form';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { EMPTY, relativeTime } from '../../lib/format';
import type { AdminUser, Role, Team } from '../../lib/types';

const PASSWORD_RULE = (p: string) => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
const USERNAME_RULE = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

interface UserFormValues {
  name: string;
  username: string;
  email: string;
  password: string;
  teamId: string;
  roleIds: string[];
  mustChangePassword: boolean;
}

function useRoles(enabled: boolean) {
  return useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<{ data: Role[] }>('/roles')).data, enabled });
}
function useTeams(enabled: boolean) {
  return useQuery({ queryKey: ['teams'], queryFn: async () => (await api.get<{ data: Team[] }>('/teams')).data, enabled });
}

function UserForm({ user, onClose }: { user?: AdminUser; onClose: () => void }) {
  const { can } = useAuth();
  const roles = useRoles(can('role.read'));
  const teams = useTeams(can('team.read'));
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, watch, setValue, setError: setFieldError } = useForm<UserFormValues>({
    defaultValues: { name: user?.name ?? '', username: user?.username ?? '', email: user?.email ?? '', password: '', teamId: user?.teamId ?? '', roleIds: [], mustChangePassword: true },
  });
  const save = useAction((body: unknown) => (user ? api.patch(`/users/${user.id}`, body) : api.post('/users', body)), {
    invalidate: ['users', 'roles', 'teams', 'lookups'],
    success: user ? 'User updated' : 'User created',
    silentError: true,
  });
  const roleIds = watch('roleIds');

  const onSubmit = async (v: UserFormValues) => {
    setError(null);
    const username = v.username.trim().toLowerCase();
    if (!v.name.trim() || !username || !v.email.trim()) return setError('Name, username and email are required');
    if (username.length < 3 || username.length > 32 || !USERNAME_RULE.test(username)) {
      return setFieldError('username', { message: 'Use 3 to 32 letters, numbers, dots or underscores' });
    }
    if (!user && !PASSWORD_RULE(v.password)) return setError('Temporary password must be at least 10 characters with letters and numbers');
    const identity = { name: v.name.trim(), username, email: v.email.trim(), teamId: v.teamId || null };
    try {
      await save.mutateAsync(user ? identity : { ...identity, password: v.password, roleIds: v.roleIds, mustChangePassword: v.mustChangePassword });
      onClose();
    } catch (e) {
      setError(applyServerErrors(e, setFieldError));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'New user'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{user ? 'Save' : 'Create user'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Full name" required><Input placeholder="Jane Doe" {...register('name')} /></Field>
        <Field label="Username" required error={formState.errors.username?.message} hint="Lowercase letters, numbers, dots or underscores.">
          <Input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="jane.doe" {...register('username')} />
        </Field>
        <Field label="Email" required error={formState.errors.email?.message}>
          <Input type="email" autoComplete="off" placeholder="jane.doe@gmail.com" {...register('email')} />
        </Field>
        {!user && (
          <Field label="Temporary password" required hint="Min. 10 characters, letters and numbers.">
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </Field>
        )}
        <Field label="Team">
          <Select {...register('teamId')}>
            <option value="">No team</option>
            {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        {!user && (
          <>
            <Checkbox className="sm:col-span-2" label="Require password change at first sign-in" {...register('mustChangePassword')} />
            {can('role.assign') && (
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">Roles</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roles.data?.map((r) => (
                    <Checkbox
                      key={r.id}
                      label={r.name}
                      checked={roleIds.includes(r.id)}
                      onChange={(e) => setValue('roleIds', e.target.checked ? [...roleIds, r.id] : roleIds.filter((x) => x !== r.id))}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}

function RolesForm({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const roles = useRoles(true);
  const [selected, setSelected] = useState<string[]>(user.roles.map((r) => r.id));
  const [error, setError] = useState<string | null>(null);
  const save = useAction((roleIds: string[]) => api.put(`/users/${user.id}/roles`, { roleIds }), { invalidate: ['users', 'roles'], success: 'Roles updated', silentError: true });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Roles for ${user.name}`}
      description="Changes take effect on the user's next request. Administrators do not gain business approval authority from the admin role."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={save.isPending}
            onClick={async () => {
              setError(null);
              try {
                await save.mutateAsync(selected);
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Save roles
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <ul className="mt-2 space-y-3">
        {roles.data?.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-3">
            <Checkbox
              label={<span><span className="font-medium">{r.name}</span><span className="block text-xs text-slate-500">{r.description}</span></span>}
              checked={selected.includes(r.id)}
              onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function ResetPasswordForm({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useAction((pw: string) => api.post(`/users/${user.id}/reset-password`, { password: pw }), { success: 'Password reset; the user must change it at next sign-in', silentError: true });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${user.name}`}
      description="All of the user's sessions are signed out."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={reset.isPending}
            onClick={async () => {
              if (!PASSWORD_RULE(password)) return setError('Min. 10 characters with letters and numbers');
              try {
                await reset.mutateAsync(password);
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Reset password
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Temporary password" className="mt-2"><PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    </Modal>
  );
}

function RowMenu({ user, onAction }: { user: AdminUser; onAction: (a: 'edit' | 'roles' | 'password' | 'status') => void }) {
  const { can, me } = useAuth();
  const self = me?.user.id === user.id;
  const items = [
    can('user.update') && { key: 'edit' as const, label: 'Edit details', icon: Pencil },
    can('role.assign') && !self && { key: 'roles' as const, label: 'Manage roles', icon: ShieldCheck },
    can('user.update') && !self && { key: 'password' as const, label: 'Reset password', icon: KeyRound },
    can('user.deactivate') && !self && { key: 'status' as const, label: user.isActive ? 'Deactivate' : 'Activate', icon: user.isActive ? UserX : UserCheck },
  ].filter(Boolean) as { key: 'edit' | 'roles' | 'password' | 'status'; label: string; icon: typeof Pencil }[];
  if (!items.length) return null;
  return (
    <div className="flex justify-end gap-0.5">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={() => onAction(i.key)}
          title={i.label}
          aria-label={`${i.label}: ${user.name}`}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <i.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const { can, me } = useAuth();
  const [modal, setModal] = useState<{ kind: 'new' | 'edit' | 'roles' | 'password' | 'status'; user?: AdminUser } | null>(null);
  const lp = useListParams<'isActive' | 'roleId'>({ sort: 'name', order: 'asc' });
  const { data, isLoading, isFetching, error, refetch } = useList<AdminUser>('users', lp.query);
  const roles = useRoles(can('role.read'));
  const setStatus = useAction(({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}/status`, { isActive }), {
    invalidate: ['users', 'lookups'],
    success: 'Account status updated',
    silentError: true,
  });

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'name',
      cell: (u) => (
        <div>
          <p className="font-medium text-slate-900">{u.name} {u.id === me?.user.id && <span className="text-xs text-slate-400">(you)</span>}</p>
          <p className="text-xs text-slate-500">@{u.username} <span className="text-slate-400">{u.email}</span></p>
        </div>
      ),
    },
    { key: 'roles', header: 'Roles', cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.length ? u.roles.map((r) => <Badge key={r.id} tone="indigo">{r.name}</Badge>) : <span className="text-xs text-slate-400">No roles</span>}</div> },
    { key: 'team', header: 'Team', cell: (u) => u.team?.name ?? EMPTY, hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (u) => (u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>) },
    { key: 'lastLoginAt', header: 'Last sign-in', sortKey: 'lastLoginAt', cell: (u) => (u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Never'), hideOnMobile: true },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', cell: (u) => <RowMenu user={u} onAction={(kind) => setModal({ kind, user: u })} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage accounts, team membership and role assignments."
        actions={can('user.create') && <Button icon={Plus} onClick={() => setModal({ kind: 'new' })}>New user</Button>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search name, username or email…" className="sm:w-72" />
          <FilterSelect label="Status" value={lp.filters.isActive ?? ''} onChange={(v) => lp.setFilter('isActive', v)} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
          <FilterSelect label="Role" value={lp.filters.roleId ?? ''} onChange={(v) => lp.setFilter('roleId', v)} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
        </Toolbar>
        <DataTable caption="Users" columns={columns} rows={data?.data} loading={isLoading || isFetching} error={error} onRetry={refetch} sort={lp} onSort={lp.setSort} empty={<EmptyState icon={UserCog} title="No users found" />} />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      {(modal?.kind === 'new' || modal?.kind === 'edit') && <UserForm user={modal.user} onClose={() => setModal(null)} />}
      {modal?.kind === 'roles' && modal.user && <RolesForm user={modal.user} onClose={() => setModal(null)} />}
      {modal?.kind === 'password' && modal.user && <ResetPasswordForm user={modal.user} onClose={() => setModal(null)} />}
      {modal?.kind === 'status' && modal.user && (
        <ConfirmDialog
          open
          onClose={() => setModal(null)}
          title={modal.user.isActive ? `Deactivate ${modal.user.name}?` : `Activate ${modal.user.name}?`}
          message={modal.user.isActive ? 'The user is signed out immediately and can no longer sign in. Their records are kept.' : 'The user will be able to sign in again.'}
          tone={modal.user.isActive ? 'danger' : 'primary'}
          confirmLabel={modal.user.isActive ? 'Deactivate' : 'Activate'}
          onConfirm={() => setStatus.mutateAsync({ id: modal.user!.id, isActive: !modal.user!.isActive })}
        />
      )}
    </div>
  );
}
