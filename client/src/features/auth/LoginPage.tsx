import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileCheck2, LogIn, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, PasswordInput } from '../../components/ui/Form';
import { BrandMark } from '../../components/ui/Layout';
import { errorMessage } from '../../lib/api';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password'),
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
      await login(v.identifier, v.password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden w-[44%] max-w-xl flex-col justify-between bg-brand-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark size="lg" />
          <span className="text-lg font-semibold tracking-tight">SalesHub</span>
        </div>
        <div className="max-w-sm">
          <h2 className="text-[2rem] leading-[1.15] font-semibold tracking-tight">Every deal, from the first call to the last payment.</h2>
          <ul className="mt-8 space-y-4 text-sm text-brand-100/80">
            <li className="flex gap-3"><Users className="mt-0.5 size-4 shrink-0 text-marigold-300" aria-hidden />Leads, customers and pipeline for the whole team</li>
            <li className="flex gap-3"><FileCheck2 className="mt-0.5 size-4 shrink-0 text-marigold-300" aria-hidden />Quotations routed to the right approver</li>
            <li className="flex gap-3"><Wallet className="mt-0.5 size-4 shrink-0 text-marigold-300" aria-hidden />Invoices and payments followed until they are paid</li>
          </ul>
        </div>
        <p className="text-xs text-brand-300/70">&copy; {new Date().getFullYear()} SalesHub. For internal use.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[22rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight">SalesHub</span>
          </div>
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-slate-600">Use your work email or username.</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Email or username" error={formState.errors.identifier?.message}>
              <Input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="you@gmail.com or your username"
                className="h-10"
                {...register('identifier')}
              />
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              <PasswordInput autoComplete="current-password" placeholder="Enter your password" className="h-10" {...register('password')} />
            </Field>
            <Button type="submit" icon={LogIn} className="h-10 w-full" loading={formState.isSubmitting}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">Forgot your password? Ask your administrator to reset it.</p>
        </div>
      </div>
    </div>
  );
}
