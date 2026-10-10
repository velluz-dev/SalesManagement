import type { Permission } from './permissions';

export const ROLE_CODES = {
  SALESPERSON: 'SALESPERSON',
  SALES_MANAGER: 'SALES_MANAGER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  DIRECTOR: 'DIRECTOR',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/**
 * Default permission sets seeded into the database. They are editable at runtime by holders
 * of `role.manage`; the database (not this map) is authoritative after seeding.
 * Note: SYSTEM_ADMIN intentionally has no business-approval or financial-write authority.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, { name: string; description: string; permissions: Permission[] }> = {
  SALESPERSON: {
    name: 'Salesperson',
    description: 'Manages own leads, opportunities and quotations',
    permissions: [
      'customer.read.own', 'customer.create', 'customer.update',
      'lead.read.own', 'lead.create', 'lead.update', 'lead.convert',
      'opportunity.read.own', 'opportunity.create', 'opportunity.update',
      'activity.read.own', 'activity.manage',
      'quotation.read.own', 'quotation.create', 'quotation.update', 'quotation.submit',
      'target.read.own',
      'report.sales.own',
    ],
  },
  SALES_MANAGER: {
    name: 'Sales Manager',
    description: 'Leads a sales team, approves quotations within authority, sets team targets',
    permissions: [
      'customer.read.team', 'customer.create', 'customer.update',
      'lead.read.team', 'lead.create', 'lead.update', 'lead.convert', 'lead.assign',
      'opportunity.read.team', 'opportunity.create', 'opportunity.update',
      'activity.read.team', 'activity.manage',
      'quotation.read.team', 'quotation.create', 'quotation.update', 'quotation.submit',
      'approval.read.assigned', 'approval.decide',
      'target.read.team', 'target.manage',
      'credit.read',
      'report.sales.team',
      'team.read',
    ],
  },
  FINANCE_OFFICER: {
    name: 'Finance Officer',
    description: 'Manages invoices, payments and customer credit',
    permissions: [
      'customer.read.all', 'customer.update',
      'quotation.read.all',
      'invoice.read', 'invoice.create', 'invoice.update', 'invoice.cancel',
      'payment.read', 'payment.create', 'payment.void',
      'credit.read', 'credit.manage',
      'report.finance',
    ],
  },
  DIRECTOR: {
    name: 'Approver / Director',
    description: 'Approves high-value requests and reviews company performance',
    permissions: [
      'customer.read.all',
      'lead.read.all',
      'opportunity.read.all',
      'quotation.read.all',
      'approval.read.assigned', 'approval.read.all', 'approval.decide',
      'target.read.all',
      'invoice.read', 'payment.read', 'credit.read',
      'report.sales.all', 'report.finance',
      'team.read', 'settings.read',
    ],
  },
  SYSTEM_ADMIN: {
    name: 'System Administrator',
    description: 'Manages users, roles, teams and system configuration (no business approval authority)',
    permissions: [
      'user.read', 'user.create', 'user.update', 'user.deactivate',
      'role.read', 'role.assign', 'role.manage',
      'team.read', 'team.manage',
      'audit.read',
      'settings.read', 'settings.manage',
    ],
  },
};
