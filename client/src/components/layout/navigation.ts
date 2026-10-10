import type { ComponentType } from 'react';
import {
  LayoutDashboard, Users, Briefcase, FileText, CheckSquare, Trophy, Receipt, Wallet, ShieldCheck,
  AlarmClock, BarChart3, UserCog, KeyRound, Network, ScrollText, Settings, CalendarCheck, Contact,
} from 'lucide-react';
import type { Permission } from '@shared';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  any: Permission[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, any: [] }],
  },
  {
    title: 'Sales',
    items: [
      { to: '/leads', label: 'Leads', icon: Contact, any: ['lead.read.own', 'lead.read.team', 'lead.read.all'] },
      { to: '/customers', label: 'Customers', icon: Users, any: ['customer.read.own', 'customer.read.team', 'customer.read.all'] },
      { to: '/opportunities', label: 'Pipeline', icon: Briefcase, any: ['opportunity.read.own', 'opportunity.read.team', 'opportunity.read.all'] },
      { to: '/activities', label: 'Activities', icon: CalendarCheck, any: ['activity.read.own', 'activity.read.team', 'activity.read.all'] },
      { to: '/quotations', label: 'Quotations', icon: FileText, any: ['quotation.read.own', 'quotation.read.team', 'quotation.read.all'] },
      { to: '/approvals', label: 'Approvals', icon: CheckSquare, any: ['approval.read.assigned', 'approval.read.all'] },
      { to: '/targets', label: 'Targets', icon: Trophy, any: ['target.read.own', 'target.read.team', 'target.read.all'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/invoices', label: 'Invoices', icon: Receipt, any: ['invoice.read'] },
      { to: '/overdue', label: 'Overdue', icon: AlarmClock, any: ['invoice.read'] },
      { to: '/payments', label: 'Payments', icon: Wallet, any: ['payment.read'] },
      { to: '/credit', label: 'Customer credit', icon: ShieldCheck, any: ['credit.read'] },
    ],
  },
  {
    title: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3, any: ['report.sales.own', 'report.sales.team', 'report.sales.all', 'report.finance'] }],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: UserCog, any: ['user.read'] },
      { to: '/admin/roles', label: 'Roles & permissions', icon: KeyRound, any: ['role.read'] },
      { to: '/admin/teams', label: 'Teams', icon: Network, any: ['team.read'] },
      { to: '/admin/audit', label: 'Audit log', icon: ScrollText, any: ['audit.read'] },
      { to: '/admin/settings', label: 'Settings', icon: Settings, any: ['settings.read'] },
    ],
  },
];
