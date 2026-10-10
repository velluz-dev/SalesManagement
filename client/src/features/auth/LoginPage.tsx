import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input } from '../../components/ui/Form';
import { errorMessage } from '../../lib/api';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (me) return <Navigate to={from} replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await login(v.email, v.password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600">
            <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
              <path d="M7 22l6-7 5 4 7-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-lg font-semibold">SalesHub CRM</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">From first contact to final payment — one secure workspace.</h2>
          <p className="mt-4 text-slate-400">
            Leads, pipeline, quotations with approval workflows, invoicing and collections, governed by role-based access control.
          </p>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} SalesHub. Internal use only.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-4 inline-flex rounded-xl bg-brand-50 p-3 text-brand-600">
              <LockKeyhole className="size-6" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Use your company account to continue.</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Email" error={formState.errors.email?.message}>
              <Input type="email" autoComplete="username" autoFocus {...register('email')} />
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} />
            </Field>
            <Button type="submit" className="w-full" loading={formState.isSubmitting}>
              Sign in
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
