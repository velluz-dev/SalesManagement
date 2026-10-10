import type { ReactNode } from 'react';
import { enumLabel } from '@crm/shared';
import { cn } from '../../lib/cn';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo' | 'teal';

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
};

export function Badge({ tone = 'gray', children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  // generic
  ACTIVE: 'green', INACTIVE: 'gray',
  // quotations
  DRAFT: 'gray', PENDING_APPROVAL: 'amber', APPROVED: 'green', REJECTED: 'red', SENT: 'blue', ACCEPTED: 'teal',
  DECLINED: 'red', CANCELLED: 'gray', SUPERSEDED: 'purple',
  // approvals
  PENDING: 'amber',
  // invoices
  ISSUED: 'blue', UNPAID: 'blue', PARTIALLY_PAID: 'amber', PAID: 'green', OVERDUE: 'red',
  // leads
  NEW: 'indigo', CONTACTED: 'blue', QUALIFIED: 'green', UNQUALIFIED: 'gray', CONVERTED: 'teal',
  // opportunities
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
      {STATUS_LABELS[status] ?? enumLabel(status)}
    </Badge>
  );
}

/** Invoice status with derived overdue state taking precedence for display. */
export function InvoiceStatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  return isOverdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status={status} />;
}
