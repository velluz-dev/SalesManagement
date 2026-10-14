import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field, FormError, Input, PasswordInput } from '../../components/ui/Form';
import { BrandMark } from '../../components/ui/Layout';
import { errorMessage } from '../../lib/api';
import { translate } from '../../i18n';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import loginIllustration from '../../assets/login-illustration.png';

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
      <div className="relative hidden w-[52%] flex-col overflow-hidden bg-brand-50 p-10 lg:flex xl:p-12">
        <div className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-brand-100/70" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -bottom-28 size-96 rounded-full bg-brand-100/60" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <BrandMark size="lg" />
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-tight text-slate-900">SalesPro</span>
            <span className="block text-[11px] font-medium tracking-wide text-slate-500">CRM</span>
          </span>
        </div>
        <div className="relative my-auto flex flex-col items-center py-6">
          <img
            src={loginIllustration}
            alt=""
            aria-hidden
            className="w-full max-w-[400px] mix-blend-multiply select-none xl:max-w-[440px]"
            draggable={false}
          />
          <h2 className="mt-6 max-w-md text-center text-2xl leading-snug font-semibold tracking-tight text-slate-900">
            {translate('Every deal, from the first call to the last payment.')}
          </h2>
          <p className="mt-2 max-w-sm text-center text-sm text-slate-500">
            {translate('Leads, quotations, approvals, orders and invoices in one secure place.')}
          </p>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-white px-5 py-12 sm:px-8">
        <LanguageSwitch className="absolute top-5 right-5" />
        <div className="w-full max-w-[22rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <span className="text-base font-bold tracking-tight">SalesPro</span>
          </div>
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{translate('Sign in')}</h1>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Email or username" error={formState.errors.identifier?.message}>
              <Input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder={translate('you@gmail.com or your username')}
                className="h-10"
                {...register('identifier')}
              />
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              <PasswordInput autoComplete="current-password" placeholder={translate('Enter your password')} className="h-10" {...register('password')} />
            </Field>
            <Button type="submit" icon={LogIn} className="h-10 w-full" loading={formState.isSubmitting}>
              {translate("Sign in")}
            </Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">{translate('Forgot your password? Ask your administrator to reset it.')}</p>
        </div>
      </div>
    </div>
  );
}
