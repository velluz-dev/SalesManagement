import type { ComponentProps, ComponentType } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { tNode } from '../../i18n';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 disabled:bg-rose-300',
  success: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ComponentType<{ className?: string }>;
  loading?: boolean;
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    className,
  );

export function Button({ variant, size, icon: Icon, loading, className, children, disabled, type = 'button', ...rest }: Common & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {tNode(children)}
    </button>
  );
}

export function ButtonLink({ variant, size, icon: Icon, className, children, ...rest }: Common & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {tNode(children)}
    </Link>
  );
}
