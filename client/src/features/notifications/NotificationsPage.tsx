import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useAction } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { api, type Paged } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/DataTable';
import { PageHeader, Tabs } from '../../components/ui/Layout';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Spinner';
import { dateTime, label } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Notification } from '../../lib/types';
import { translate } from '../../i18n';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const lp = useListParams<'unread'>({});
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'page', lp.query],
    queryFn: () => api.get<Paged<Notification> & { unread: number }>('/notifications', lp.query),
  });
  const readAll = useAction(() => api.post('/notifications/read-all'), { invalidate: ['notifications'], success: 'All notifications marked as read' });

  const open = async (n: Notification) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    void refetch();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={translate("Notifications")}
        description="Approval requests, decisions, overdue invoices and assignments."
        actions={!!data?.unread && <Button variant="secondary" icon={CheckCheck} onClick={() => readAll.mutate(undefined)}>{translate("Mark all as read")}</Button>}
      />
      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs value={lp.filters.unread === 'true' ? 'unread' : 'all'} onChange={(v) => lp.setFilter('unread', v === 'unread' ? 'true' : '')} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: data?.unread }]} />
        </div>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.data.length ? (
          <EmptyState icon={Bell} title={translate("No notifications")} description="You're all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.data.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn('flex w-full gap-3 px-5 py-4 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-label={n.readAt ? undefined : 'Unread'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{n.title}</span>
                      <Badge tone={n.type === 'INVOICE_OVERDUE' ? 'red' : n.type === 'APPROVAL_REQUESTED' ? 'amber' : 'gray'}>{label(n.type)}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                    <span className="mt-1 block text-xs text-slate-400">{dateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
