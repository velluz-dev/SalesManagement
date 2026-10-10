/**
 * Permission catalogue. Permissions (not role names) are the unit of authorization
 * on both the server (endpoint guards + data scoping) and the client (menus/buttons).
 */
export const PERMISSIONS = {
  // Customers
  CUSTOMER_READ_OWN: 'customer.read.own',
  CUSTOMER_READ_TEAM: 'customer.read.team',
  CUSTOMER_READ_ALL: 'customer.read.all',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',

  // Leads
  LEAD_READ_OWN: 'lead.read.own',
  LEAD_READ_TEAM: 'lead.read.team',
  LEAD_READ_ALL: 'lead.read.all',
  LEAD_CREATE: 'lead.create',
  LEAD_UPDATE: 'lead.update',
  LEAD_CONVERT: 'lead.convert',
  LEAD_ASSIGN: 'lead.assign',

  // Opportunities
  OPPORTUNITY_READ_OWN: 'opportunity.read.own',
  OPPORTUNITY_READ_TEAM: 'opportunity.read.team',
  OPPORTUNITY_READ_ALL: 'opportunity.read.all',
  OPPORTUNITY_CREATE: 'opportunity.create',
  OPPORTUNITY_UPDATE: 'opportunity.update',

  // Activities
  ACTIVITY_READ_OWN: 'activity.read.own',
  ACTIVITY_READ_TEAM: 'activity.read.team',
  ACTIVITY_READ_ALL: 'activity.read.all',
  ACTIVITY_MANAGE: 'activity.manage',

  // Quotations
  QUOTATION_READ_OWN: 'quotation.read.own',
  QUOTATION_READ_TEAM: 'quotation.read.team',
  QUOTATION_READ_ALL: 'quotation.read.all',
  QUOTATION_CREATE: 'quotation.create',
  QUOTATION_UPDATE: 'quotation.update',
  QUOTATION_SUBMIT: 'quotation.submit',

  // Approvals
  APPROVAL_READ_ASSIGNED: 'approval.read.assigned',
  APPROVAL_READ_ALL: 'approval.read.all',
  APPROVAL_DECIDE: 'approval.decide',

  // Targets
  TARGET_READ_OWN: 'target.read.own',
  TARGET_READ_TEAM: 'target.read.team',
  TARGET_READ_ALL: 'target.read.all',
  TARGET_MANAGE: 'target.manage',

  // Finance
  INVOICE_READ: 'invoice.read',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_CANCEL: 'invoice.cancel',
  PAYMENT_READ: 'payment.read',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_VOID: 'payment.void',
  CREDIT_READ: 'credit.read',
  CREDIT_MANAGE: 'credit.manage',

  // Reports
  REPORT_SALES_OWN: 'report.sales.own',
  REPORT_SALES_TEAM: 'report.sales.team',
  REPORT_SALES_ALL: 'report.sales.all',
  REPORT_FINANCE: 'report.finance',

  // Administration
  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DEACTIVATE: 'user.deactivate',
  ROLE_READ: 'role.read',
  ROLE_ASSIGN: 'role.assign',
  ROLE_MANAGE: 'role.manage',
  TEAM_READ: 'team.read',
  TEAM_MANAGE: 'team.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_GROUPS: { group: string; permissions: { code: Permission; description: string }[] }[] = [
  {
    group: 'Customers',
    permissions: [
      { code: 'customer.read.own', description: 'View own customers' },
      { code: 'customer.read.team', description: "View team members' customers" },
      { code: 'customer.read.all', description: 'View all customers' },
      { code: 'customer.create', description: 'Create customers' },
      { code: 'customer.update', description: 'Update customers within read scope' },
    ],
  },
  {
    group: 'Leads',
    permissions: [
      { code: 'lead.read.own', description: 'View own leads' },
      { code: 'lead.read.team', description: "View team members' leads" },
      { code: 'lead.read.all', description: 'View all leads' },
      { code: 'lead.create', description: 'Create leads' },
      { code: 'lead.update', description: 'Update leads within read scope' },
      { code: 'lead.convert', description: 'Convert leads to customers/opportunities' },
      { code: 'lead.assign', description: 'Re-assign record owners within managed teams' },
    ],
  },
  {
    group: 'Opportunities',
    permissions: [
      { code: 'opportunity.read.own', description: 'View own opportunities' },
      { code: 'opportunity.read.team', description: "View team members' opportunities" },
      { code: 'opportunity.read.all', description: 'View all opportunities' },
      { code: 'opportunity.create', description: 'Create opportunities' },
      { code: 'opportunity.update', description: 'Update opportunities within read scope' },
    ],
  },
  {
    group: 'Activities',
    permissions: [
      { code: 'activity.read.own', description: 'View own activities' },
      { code: 'activity.read.team', description: "View team members' activities" },
      { code: 'activity.read.all', description: 'View all activities' },
      { code: 'activity.manage', description: 'Create and update activities within read scope' },
    ],
  },
  {
    group: 'Quotations',
    permissions: [
      { code: 'quotation.read.own', description: 'View own quotations' },
      { code: 'quotation.read.team', description: "View team members' quotations" },
      { code: 'quotation.read.all', description: 'View all quotations' },
      { code: 'quotation.create', description: 'Create quotations' },
      { code: 'quotation.update', description: 'Edit draft/rejected quotations and revise' },
      { code: 'quotation.submit', description: 'Submit quotations for approval' },
    ],
  },
  {
    group: 'Approvals',
    permissions: [
      { code: 'approval.read.assigned', description: 'View approval requests assigned to me' },
      { code: 'approval.read.all', description: 'View all approval requests' },
      { code: 'approval.decide', description: 'Approve or reject requests within approval authority' },
    ],
  },
  {
    group: 'Sales targets',
    permissions: [
      { code: 'target.read.own', description: 'View own targets' },
      { code: 'target.read.team', description: 'View team targets' },
      { code: 'target.read.all', description: 'View all targets' },
      { code: 'target.manage', description: 'Set targets (team scope, or all with target.read.all)' },
    ],
  },
  {
    group: 'Finance',
    permissions: [
      { code: 'invoice.read', description: 'View invoices' },
      { code: 'invoice.create', description: 'Create invoices' },
      { code: 'invoice.update', description: 'Edit draft invoices and issue them' },
      { code: 'invoice.cancel', description: 'Cancel invoices' },
      { code: 'payment.read', description: 'View payments' },
      { code: 'payment.create', description: 'Record payments' },
      { code: 'payment.void', description: 'Void payments' },
      { code: 'credit.read', description: 'View customer credit information' },
      { code: 'credit.manage', description: 'Set credit limits, terms and holds' },
    ],
  },
  {
    group: 'Reports',
    permissions: [
      { code: 'report.sales.own', description: 'Personal sales reports' },
      { code: 'report.sales.team', description: 'Team sales reports' },
      { code: 'report.sales.all', description: 'Company-wide sales reports' },
      { code: 'report.finance', description: 'Financial reports' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { code: 'user.read', description: 'View users' },
      { code: 'user.create', description: 'Create users' },
      { code: 'user.update', description: 'Update user profiles' },
      { code: 'user.deactivate', description: 'Activate / deactivate users' },
      { code: 'role.read', description: 'View roles and permissions' },
      { code: 'role.assign', description: 'Assign roles to other users' },
      { code: 'role.manage', description: 'Edit role permission sets' },
      { code: 'team.read', description: 'View teams' },
      { code: 'team.manage', description: 'Create and edit teams' },
      { code: 'audit.read', description: 'View audit logs' },
      { code: 'settings.read', description: 'View system settings' },
      { code: 'settings.manage', description: 'Change system settings and approval rules' },
    ],
  },
];

export type Scope = 'own' | 'team' | 'all';

/** Resource families that support own/team/all data scoping. */
export type ScopedResource = 'customer' | 'lead' | 'opportunity' | 'activity' | 'quotation' | 'target' | 'report.sales';

/** Returns the widest scope the permission set grants for a resource, or null when none. */
export function resolveScope(perms: Iterable<string>, resource: ScopedResource): Scope | null {
  const set = perms instanceof Set ? (perms as Set<string>) : new Set(perms);
  if (set.has(`${resource}.read.all`) || (resource === 'report.sales' && set.has('report.sales.all'))) return 'all';
  if (set.has(`${resource}.read.team`) || (resource === 'report.sales' && set.has('report.sales.team'))) return 'team';
  if (set.has(`${resource}.read.own`) || (resource === 'report.sales' && set.has('report.sales.own'))) return 'own';
  return null;
}
