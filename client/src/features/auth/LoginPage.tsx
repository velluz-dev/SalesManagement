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
    <div className="relative flex min-h-screen overflow-hidden bg-brand-50 lg:bg-white">
      <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
        <div className="absolute -top-24 -left-24 size-72 rounded-full bg-brand-100/70" />
        <div className="absolute -right-20 -bottom-28 size-80 rounded-full bg-brand-100/60" />
      </div>
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
            className="max-h-[52vh] w-full max-w-[400px] object-contain mix-blend-multiply select-none xl:max-w-[440px]"
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

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 pt-20 pb-10 sm:px-8 lg:bg-white lg:py-12">
        <div className="absolute top-5 left-5 z-10 flex items-center gap-2.5 lg:hidden">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-slate-900">SalesPro</span>
            <span className="block text-[10px] font-medium tracking-wide text-slate-500">CRM</span>
          </span>
        </div>
        <LanguageSwitch className="absolute top-5 right-5 z-10" />
        <img
          src={loginIllustration}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-70 mix-blend-multiply select-none lg:hidden"
          draggable={false}
        />
        <div className="relative w-full max-w-[22rem] rounded-2xl border border-white/80 bg-white/85 p-6 shadow-[0_12px_32px_-12px_rgb(16_24_64/0.22)] backdrop-blur-md sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
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
