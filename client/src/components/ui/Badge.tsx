import type { ReactNode } from 'react';
import { enumLabel } from '@shared';
import { cn } from '../../lib/cn';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo' | 'teal';

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-sky-100/70 text-sky-800',
  green: 'bg-emerald-100/70 text-emerald-800',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-rose-100/70 text-rose-800',
  purple: 'bg-violet-100/70 text-violet-800',
  indigo: 'bg-brand-100 text-brand-800',
  teal: 'bg-teal-100/70 text-teal-800',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'green', INACTIVE: 'gray',
  DRAFT: 'gray', PENDING_APPROVAL: 'amber', APPROVED: 'green', REJECTED: 'red', SENT: 'blue', ACCEPTED: 'teal',
  DECLINED: 'red', CANCELLED: 'gray', SUPERSEDED: 'purple',
  PENDING: 'amber',
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
      {STATUS_LABELS[status] ?? enumLabel(status)}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  return isOverdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status={status} />;
}
