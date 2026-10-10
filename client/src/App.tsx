import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Permission } from '@crm/shared';
import { RequireAuth, RequirePermission } from './auth/guards';
import { AppLayout } from './components/layout/AppLayout';
import { FullPageSpinner } from './components/ui/Spinner';
import { EmptyState } from './components/ui/EmptyState';
import { LoginPage } from './features/auth/LoginPage';
import { ProfilePage } from './features/auth/ProfilePage';

// Route-level code splitting keeps the initial bundle small.
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const CustomersPage = lazy(() => import('./features/customers/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./features/customers/CustomerDetailPage'));
const LeadsPage = lazy(() => import('./features/leads/LeadsPage'));
const LeadDetailPage = lazy(() => import('./features/leads/LeadDetailPage'));
const OpportunitiesPage = lazy(() => import('./features/opportunities/OpportunitiesPage'));
const OpportunityDetailPage = lazy(() => import('./features/opportunities/OpportunityDetailPage'));
const ActivitiesPage = lazy(() => import('./features/activities/ActivitiesPage'));
const QuotationsPage = lazy(() => import('./features/quotations/QuotationsPage'));
const QuotationEditorPage = lazy(() => import('./features/quotations/QuotationEditorPage'));
const QuotationDetailPage = lazy(() => import('./features/quotations/QuotationDetailPage'));
const ApprovalsPage = lazy(() => import('./features/approvals/ApprovalsPage'));
const ApprovalDetailPage = lazy(() => import('./features/approvals/ApprovalDetailPage'));
const TargetsPage = lazy(() => import('./features/targets/TargetsPage'));
const InvoicesPage = lazy(() => import('./features/invoices/InvoicesPage'));
const InvoiceCreatePage = lazy(() => import('./features/invoices/InvoiceCreatePage'));
const InvoiceDetailPage = lazy(() => import('./features/invoices/InvoiceDetailPage'));
const PaymentsPage = lazy(() => import('./features/payments/PaymentsPage'));
const CreditPage = lazy(() => import('./features/credit/CreditPage'));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage'));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'));
const UsersPage = lazy(() => import('./features/admin/UsersPage'));
const RolesPage = lazy(() => import('./features/admin/RolesPage'));
const TeamsPage = lazy(() => import('./features/admin/TeamsPage'));
const AuditLogPage = lazy(() => import('./features/admin/AuditLogPage'));
const SettingsPage = lazy(() => import('./features/admin/SettingsPage'));

const guard = (any: Permission[], el: ReactNode) => <RequirePermission any={any}>{el}</RequirePermission>;

const P = {
  customer: ['customer.read.own', 'customer.read.team', 'customer.read.all'],
  lead: ['lead.read.own', 'lead.read.team', 'lead.read.all'],
  opportunity: ['opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'],
  activity: ['activity.read.own', 'activity.read.team', 'activity.read.all'],
  quotation: ['quotation.read.own', 'quotation.read.team', 'quotation.read.all'],
  target: ['target.read.own', 'target.read.team', 'target.read.all'],
  report: ['report.sales.own', 'report.sales.team', 'report.sales.all', 'report.finance'],
} satisfies Record<string, Permission[]>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route
            path="*"
            element={
              <Suspense fallback={<FullPageSpinner />}>
                <Routes>
                  <Route index element={<DashboardPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="notifications" element={<NotificationsPage />} />

                  <Route path="customers" element={guard(P.customer, <CustomersPage />)} />
                  <Route path="customers/:id" element={guard(P.customer, <CustomerDetailPage />)} />
                  <Route path="leads" element={guard(P.lead, <LeadsPage />)} />
                  <Route path="leads/:id" element={guard(P.lead, <LeadDetailPage />)} />
                  <Route path="opportunities" element={guard(P.opportunity, <OpportunitiesPage />)} />
                  <Route path="opportunities/:id" element={guard(P.opportunity, <OpportunityDetailPage />)} />
                  <Route path="activities" element={guard(P.activity, <ActivitiesPage />)} />
                  <Route path="quotations" element={guard(P.quotation, <QuotationsPage />)} />
                  <Route path="quotations/new" element={guard(['quotation.create'], <QuotationEditorPage />)} />
                  <Route path="quotations/:id" element={guard(P.quotation, <QuotationDetailPage />)} />
                  <Route path="quotations/:id/edit" element={guard(['quotation.update'], <QuotationEditorPage />)} />
                  <Route path="approvals" element={guard(['approval.read.assigned', 'approval.read.all'], <ApprovalsPage />)} />
                  <Route path="approvals/:id" element={<ApprovalDetailPage />} />
                  <Route path="targets" element={guard(P.target, <TargetsPage />)} />

                  <Route path="invoices" element={guard(['invoice.read'], <InvoicesPage />)} />
                  <Route path="invoices/new" element={guard(['invoice.create'], <InvoiceCreatePage />)} />
                  <Route path="invoices/:id" element={guard(['invoice.read'], <InvoiceDetailPage />)} />
                  <Route path="overdue" element={guard(['invoice.read'], <InvoicesPage overdueOnly />)} />
                  <Route path="payments" element={guard(['payment.read'], <PaymentsPage />)} />
                  <Route path="credit" element={guard(['credit.read'], <CreditPage />)} />
                  <Route path="reports" element={guard(P.report, <ReportsPage />)} />

                  <Route path="admin/users" element={guard(['user.read'], <UsersPage />)} />
                  <Route path="admin/roles" element={guard(['role.read'], <RolesPage />)} />
                  <Route path="admin/teams" element={guard(['team.read'], <TeamsPage />)} />
                  <Route path="admin/audit" element={guard(['audit.read'], <AuditLogPage />)} />
                  <Route path="admin/settings" element={guard(['settings.read'], <SettingsPage />)} />

                  <Route path="404" element={<EmptyState title="Page not found" description="The page you are looking for does not exist." />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
