import type { ReactNode } from 'react';
import { currentLang, enumLabel } from '../../i18n';
import { cn } from '../../lib/cn';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo' | 'teal';

const tones: Record<Tone, string> = {
  gray: 'border border-slate-200 bg-slate-50 text-slate-600',
  blue: 'border border-sky-100 bg-sky-50 text-sky-700',
  green: 'border border-emerald-100 bg-[#e9f9ef] text-[#1d9e57]',
  amber: 'border border-amber-100 bg-[#fdf3e0] text-[#b7791f]',
  red: 'border border-rose-100 bg-[#fdeeee] text-[#d93f4c]',
  purple: 'border border-violet-100 bg-violet-50 text-violet-700',
  indigo: 'border border-brand-100 bg-brand-50 text-brand-700',
  teal: 'border border-teal-100 bg-teal-50 text-teal-700',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'green', INACTIVE: 'gray',
  DRAFT: 'gray', PENDING_APPROVAL: 'amber', APPROVED: 'green', REJECTED: 'red', SENT: 'blue', ACCEPTED: 'teal',
  DECLINED: 'red', CANCELLED: 'gray', SUPERSEDED: 'purple',
  PENDING: 'amber', CONFIRMED: 'blue', DELIVERED: 'green', COMPLETED: 'teal',
  ISSUED: 'blue', UNPAID: 'blue', PARTIALLY_PAID: 'amber', PAID: 'green', OVERDUE: 'red',
  NEW: 'indigo', CONTACTED: 'blue', QUALIFIED: 'green', UNQUALIFIED: 'gray', CONVERTED: 'teal',
  PROSPECTING: 'gray', QUALIFICATION: 'blue', PROPOSAL: 'indigo', NEGOTIATION: 'amber', CLOSED_WON: 'green', CLOSED_LOST: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Pending approval',
  PARTIALLY_PAID: 'Partially paid',
  ISSUED: 'Unpaid',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'gray'} className={className}>
      {(currentLang() === 'en' && STATUS_LABELS[status]) || enumLabel(status)}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  return isOverdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status={status} />;
}
