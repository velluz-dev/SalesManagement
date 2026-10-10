import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './Button';
import { errorMessage } from '../../lib/api';
import { tNode, translate } from '../../i18n';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Icon className="mb-3 size-7 text-slate-300" aria-hidden />
      <h3 className="text-sm font-semibold text-slate-900">{translate(title)}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{tNode(description)}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={translate("This page could not load")}
      description={errorMessage(error)}
      action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{translate("Try again")}</Button>}
    />
  );
}
