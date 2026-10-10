import { CheckCircle2, CircleSlash, GitBranch, Send, XCircle } from 'lucide-react';
import { enumLabel } from '@crm/shared';
import { StatusBadge } from '../../components/ui/Badge';
import { dateTime, money } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { ApprovalRequest } from '../../lib/types';

const ICONS = {
  SUBMITTED: { icon: Send, cls: 'bg-sky-100 text-sky-700' },
  APPROVED: { icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { icon: XCircle, cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { icon: CircleSlash, cls: 'bg-slate-100 text-slate-600' },
  REVISED: { icon: GitBranch, cls: 'bg-violet-100 text-violet-700' },
} as const;

/** Full approval history: who requested, who it was routed to, every decision with timestamps and comments. */
export function ApprovalTimeline({ requests, currency }: { requests: ApprovalRequest[]; currency?: string }) {
  if (!requests.length) return <p className="text-sm text-slate-500">This quotation has not been submitted for approval yet.</p>;
  return (
    <div className="space-y-6">
      {requests.map((r) => (
        <div key={r.id} className="rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
            <span className="font-medium">
              Version {r.quotationVersion} · {money(r.amount, { currency })}
            </span>
            <StatusBadge status={r.status} />
          </div>
          <div className="px-4 py-2 text-xs text-slate-500">
            Routed to <span className="font-medium text-slate-700">{r.assignedTo ? r.assignedTo.name : `any ${r.approverRole.name}`}</span>
            {r.rule && <> by rule “{r.rule.name}”</>}
          </div>
          <ol className="relative space-y-4 px-4 pt-2 pb-4">
            {r.history.map((h, idx) => {
              const meta = ICONS[h.action as keyof typeof ICONS] ?? ICONS.SUBMITTED;
              const Icon = meta.icon;
              return (
                <li key={h.id} className="relative flex gap-3">
                  {idx < r.history.length - 1 && <span className="absolute top-8 bottom-[-16px] left-[13px] w-px bg-slate-200" aria-hidden />}
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', meta.cls)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-medium text-slate-900">{h.actor.name}</span>{' '}
                      <span className="text-slate-600">{enumLabel(h.action).toLowerCase()}</span>
                    </p>
                    <p className="text-xs text-slate-500">{dateTime(h.createdAt)}</p>
                    {h.comment && <blockquote className="mt-1.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">“{h.comment}”</blockquote>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
