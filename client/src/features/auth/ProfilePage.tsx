import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field, FormError, PasswordInput } from '../../components/ui/Form';
import { Card, DescriptionList, PageHeader } from '../../components/ui/Layout';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useState } from 'react';
import { EMPTY } from '../../lib/format';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(10, 'At least 10 characters')
      .max(128)
      .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Must contain letters and numbers'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type Values = z.infer<typeof schema>;

export function ProfilePage() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const forced = (location.state as { forced?: boolean } | null)?.forced || me?.user.mustChangePassword;
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed. Other sessions have been signed out.');
      reset();
      await refresh();
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as keyof Values, { message: m });
      setError(errorMessage(e));
    }
  };

  if (!me) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile" description="Your account details and security settings." />
      {forced && (
        <div role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your administrator requires you to set a new password before continuing.
        </div>
      )}
      <div className="space-y-6">
        <Card title="Account">
          <DescriptionList
            items={[
              { label: 'Name', value: me.user.name },
              { label: 'Username', value: me.user.username },
              { label: 'Email', value: me.user.email },
              { label: 'Roles', value: me.roles.map(enumLabel).join(', ') || EMPTY },
              { label: 'Team', value: me.user.team?.name ?? EMPTY },
            ]}
          />
        </Card>
        <Card title="Change password" description="Use at least 10 characters with letters and numbers.">
          <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Current password" error={formState.errors.currentPassword?.message} required>
              <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
            </Field>
            <Field label="New password" error={formState.errors.newPassword?.message} required>
              <PasswordInput autoComplete="new-password" {...register('newPassword')} />
            </Field>
            <Field label="Confirm new password" error={formState.errors.confirm?.message} required>
              <PasswordInput autoComplete="new-password" {...register('confirm')} />
            </Field>
            <Button type="submit" loading={formState.isSubmitting}>Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
