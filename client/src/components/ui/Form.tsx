import { cloneElement, isValidElement, useId, useState, type ChangeEvent, type ComponentProps, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { tNode, translate } from '../../i18n';

const control =
  'block w-full rounded-md border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:bg-slate-50 disabled:text-slate-500';
const controlState = (invalid?: boolean) => (invalid ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-brand-500');

export function Input({ className, invalid, ...rest }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cn(control, controlState(invalid), 'h-9', className)} aria-invalid={invalid || undefined} {...rest} />;
}

export interface NumberRules {
  /** Allowed digits after the decimal point; 0 = whole numbers only. Default 2. */
  decimals?: number;
  /** Values above this are capped (e.g. 100 for percentages). */
  maxValue?: number;
  /** Longest whole-number part, to match server limits. Default 12. */
  maxIntegerDigits?: number;
}

/**
 * Reduces text to a valid non-negative number string: digits and at most one decimal point,
 * limited decimals and length, capped at `max`. Commas and spaces from pasted amounts are dropped.
 */
export function sanitizeNumber(raw: string, { decimals = 2, maxValue, maxIntegerDigits = 12 }: NumberRules = {}): string {
  let v = raw.replace(/[^\d.]/g, '');
  if (decimals === 0) {
    v = v.replace(/\./g, '');
  } else {
    const dot = v.indexOf('.');
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
  }
  const [intRaw = '', frac] = v.split('.');
  const int = intRaw.slice(0, maxIntegerDigits).replace(/^0+(?=\d)/, '');
  v = frac !== undefined ? `${int || '0'}.${frac}` : int;
  if (maxValue !== undefined && v !== '' && Number(v) > maxValue) v = String(maxValue);
  return v;
}

/**
 * Text box that only ever holds a valid number. Letters and symbols are blocked as you type, pasted
 * text is cleaned, and a trailing "." is removed on blur. Works with react-hook-form `register` and
 * with controlled `value`/`onChange`. The server still validates every value.
 */
export function NumberInput({ decimals = 2, maxValue, maxIntegerDigits, onChange, onBlur, invalid, ...rest }: Omit<ComponentProps<'input'>, 'type'> & NumberRules & { invalid?: boolean }) {
  const rules = { decimals, maxValue, maxIntegerDigits };
  const emit = (target: HTMLInputElement, e: SyntheticEvent<HTMLInputElement>) => onChange?.({ ...e, target, currentTarget: target } as ChangeEvent<HTMLInputElement>);
  return (
    <Input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      invalid={invalid}
      onBeforeInput={(e) => {
        const data = (e as unknown as { data?: string | null }).data;
        if (data && (/[^\d.]/.test(data) || (decimals === 0 && data.includes('.')))) e.preventDefault();
      }}
      onChange={(e) => {
        const clean = sanitizeNumber(e.target.value, rules);
        if (clean !== e.target.value) e.target.value = clean;
        onChange?.(e);
      }}
      onBlur={(e) => {
        if (e.target.value.endsWith('.')) {
          e.target.value = e.target.value.slice(0, -1);
          emit(e.target, e);
        }
        onBlur?.(e);
      }}
    />
  );
}

export function PasswordInput({ className, invalid, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(control, controlState(invalid), 'h-9 pr-10', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 hover:text-slate-700"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function Select({ className, invalid, children, ...rest }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select className={cn(control, controlState(invalid), 'h-9 pr-8', className)} aria-invalid={invalid || undefined} {...rest}>
      {tNode(children)}
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
      {tNode(label)}
    </label>
  );
}

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
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {tNode(label)}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}
      </label>
      {child}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-rose-600">
          {tNode(error)}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {tNode(hint)}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border-l-[3px] border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {translate(message)}
    </div>
  );
}
