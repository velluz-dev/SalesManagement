import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

const control =
  'block w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 disabled:text-slate-500';
const controlState = (invalid?: boolean) => (invalid ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-brand-500');

export function Input({ className, invalid, ...rest }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cn(control, controlState(invalid), 'h-10', className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select className={cn(control, controlState(invalid), 'h-10 pr-8', className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, invalid, ...rest }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(control, controlState(invalid), 'py-2', className)} rows={3} aria-invalid={invalid || undefined} {...rest} />;
}

export function Checkbox({ label, className, ...rest }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700', className)}>
      <input type="checkbox" className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...rest} />
      {label}
    </label>
  );
}

/**
 * Label + control + error/hint wiring. The child control receives id, aria-describedby and invalid
 * automatically so errors are announced by screen readers.
 */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; invalid?: boolean; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const child = isValidElement(children)
    ? cloneElement(children, { id, invalid: !!error, 'aria-describedby': describedBy })
    : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}
      </label>
      {child}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </div>
  );
}
