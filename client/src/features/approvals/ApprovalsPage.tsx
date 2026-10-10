import { useNavigate } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { PageHeader, SearchInput, Tabs, Toolbar } from '../../components/ui/Layout';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { date, money, relativeTime } from '../../lib/format';
import type { ApprovalRequest } from '../../lib/types';

export default function ApprovalsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canAssigned = can('approval.read.assigned');
  const lp = useListParams<'view' | 'status'>({ sort: 'createdAt', order: 'asc', view: canAssigned ? 'assigned' : 'all', status: 'PENDING' });
  const { data, isLoading, isFetching, error, refetch } = useList<ApprovalRequest>('approvals', lp.query);

  const tab = `${lp.filters.view}:${lp.filters.status}`;
  const tabs = [
    ...(canAssigned
      ? [
          { value: 'assigned:PENDING', label: 'Awaiting my decision' },
          { value: 'assigned:', label: 'My queue history' },
        ]
      : []),
    ...(can('approval.read.all') ? [{ value: 'all:PENDING', label: 'All pending' }, { value: 'all:', label: 'All requests' }] : []),
  ];

  const columns: Column<ApprovalRequest>[] = [
    {
      key: 'quotation',
      header: 'Quotation',
      cell: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.quotation?.number} <span className="text-xs text-slate-400">v{r.quotationVersion}</span></p>
          <p className="text-xs text-slate-500">{r.quotation?.customer.name}</p>
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', cell: (r) => <span className="tabular font-medium">{money(r.amount, { currency: r.quotation?.currency })}</span> },
    { key: 'requestedBy', header: 'Requested by', cell: (r) => r.requestedBy.name, hideOnMobile: true },
    { key: 'routed', header: 'Routed to', cell: (r) => (r.assignedTo ? r.assignedTo.name : `Any ${r.approverRole.name}`), hideOnMobile: true },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.status === 'PENDING' && r.canDecide && <Badge tone="indigo" dot={false}>Action needed</Badge>}
        </span>
      ),
    },
    { key: 'createdAt', header: 'Submitted', sortKey: 'createdAt', cell: (r) => <span title={date(r.createdAt)}>{relativeTime(r.createdAt)}</span>, hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader title="Approvals" description="Quotation approval requests routed by the configured approval rules." />
      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={(v) => {
              const [view, status] = v.split(':');
              lp.setFilter('view', view!);
              lp.setFilter('status', status ?? '');
            }}
            tabs={tabs}
          />
        </div>
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search quotation or customer…" className="sm:w-80" />
        </Toolbar>
        <DataTable
          caption="Approval requests"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          onRowClick={(r) => navigate(`/approvals/${r.id}`)}
          empty={<EmptyState icon={CheckSquare} title="No approval requests" description="Nothing matches this view right now." />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
    </div>
  );
}
