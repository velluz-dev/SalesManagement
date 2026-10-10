import type { ComponentType } from 'react';
import {
  LayoutDashboard, Users, FileText, CheckSquare, Trophy, Receipt, Wallet, HandCoins, AlarmClock, CalendarDays,
  BarChart3, PieChart, Settings, Contact, Briefcase, Package, FileSignature, ClipboardList, CalendarCheck,
  UserCog, KeyRound, Network, ScrollText,
} from 'lucide-react';
import type { Permission } from '@shared';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  any: Permission[];
}

export interface NavSection {
  /** Empty for the top-level items above the first heading. */
  title: string;
  items: NavItem[];
}

const SALES_REPORTS: Permission[] = ['report.sales.own', 'report.sales.team', 'report.sales.all'];

export const NAVIGATION: NavSection[] = [
  { title: '', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, any: [] }] },
  {
    title: 'SALES',
    items: [
      { to: '/leads', label: 'Leads', icon: Contact, any: ['lead.read.own', 'lead.read.team', 'lead.read.all'] },
      { to: '/opportunities', label: 'Opportunities', icon: Briefcase, any: ['opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'] },
      { to: '/quotations', label: 'Quotations', icon: FileText, any: ['quotation.read.own', 'quotation.read.team', 'quotation.read.all'] },
      { to: '/approvals', label: 'Approvals', icon: CheckSquare, any: ['approval.read.assigned', 'approval.read.all'] },
      { to: '/contracts', label: 'Contracts', icon: FileSignature, any: ['contract.read.own', 'contract.read.team', 'contract.read.all'] },
      { to: '/sales-orders', label: 'Sales Orders', icon: ClipboardList, any: ['order.read.own', 'order.read.team', 'order.read.all'] },
      { to: '/customers', label: 'Customers', icon: Users, any: ['customer.read.own', 'customer.read.team', 'customer.read.all'] },
      { to: '/products', label: 'Products', icon: Package, any: ['product.read', 'product.manage'] },
      { to: '/activities', label: 'Activities', icon: CalendarCheck, any: ['activity.read.own', 'activity.read.team', 'activity.read.all'] },
      { to: '/targets', label: 'Sales Target', icon: Trophy, any: ['target.read.own', 'target.read.team', 'target.read.all'] },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { to: '/invoices', label: 'Invoices', icon: Receipt, any: ['invoice.read'] },
      { to: '/payments', label: 'Payments', icon: Wallet, any: ['payment.read'] },
      { to: '/credit', label: 'Customer Credit', icon: HandCoins, any: ['credit.read'] },
      { to: '/overdue', label: 'Overdue', icon: AlarmClock, any: ['invoice.read'] },
      { to: '/payment-terms', label: 'Payment Terms', icon: CalendarDays, any: ['credit.manage'] },
    ],
  },
  {
    title: 'REPORTS',
    items: [
      { to: '/reports?tab=sales', label: 'Sales Reports', icon: BarChart3, any: SALES_REPORTS },
      { to: '/reports?tab=finance', label: 'Financial Reports', icon: PieChart, any: ['report.finance'] },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { to: '/admin/settings', label: 'System Settings', icon: Settings, any: ['settings.read'] },
      { to: '/admin/users', label: 'Users', icon: UserCog, any: ['user.read'] },
      { to: '/admin/roles', label: 'Roles & Permissions', icon: KeyRound, any: ['role.read'] },
      { to: '/admin/teams', label: 'Teams', icon: Network, any: ['team.read'] },
      { to: '/admin/audit', label: 'Audit Log', icon: ScrollText, any: ['audit.read'] },
    ],
  },
];

/** Record lists the global search can send a query to; each list page reads `?q=`. */
export const SEARCH_TARGETS: { to: string; label: string; icon: ComponentType<{ className?: string }>; any: Permission[] }[] = [
  { to: '/customers', label: 'Customers', icon: Users, any: ['customer.read.own', 'customer.read.team', 'customer.read.all'] },
  { to: '/leads', label: 'Leads', icon: Contact, any: ['lead.read.own', 'lead.read.team', 'lead.read.all'] },
  { to: '/opportunities', label: 'Opportunities', icon: Briefcase, any: ['opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'] },
  { to: '/quotations', label: 'Quotations', icon: FileText, any: ['quotation.read.own', 'quotation.read.team', 'quotation.read.all'] },
  { to: '/sales-orders', label: 'Sales Orders', icon: ClipboardList, any: ['order.read.own', 'order.read.team', 'order.read.all'] },
  { to: '/products', label: 'Products', icon: Package, any: ['product.read', 'product.manage'] },
  { to: '/invoices', label: 'Invoices', icon: Receipt, any: ['invoice.read'] },
];

/** A link with a query string (e.g. /reports?tab=finance) is active only when its query matches too. */
export function isNavActive(to: string, pathname: string, search: string) {
  const [path = '/', query] = to.split('?');
  if (path === '/') return pathname === '/';
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  if (!query) return true;
  const have = new URLSearchParams(search);
  return [...new URLSearchParams(query)].every(([k, v]) => (have.get(k) ?? (k === 'tab' ? 'sales' : null)) === v);
}
