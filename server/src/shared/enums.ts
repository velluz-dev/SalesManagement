export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'EVENT', 'COLD_CALL', 'PARTNER', 'OTHER'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const OPPORTUNITY_STAGES = [
  'PROSPECTING',
  'QUALIFICATION',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const OPEN_OPPORTUNITY_STAGES: OpportunityStage[] = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'];

export const ACTIVITY_TYPES = ['CALL', 'MEETING', 'EMAIL', 'TASK', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const QUOTATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'SUPERSEDED',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const EDITABLE_QUOTATION_STATUSES: QuotationStatus[] = ['DRAFT', 'REJECTED'];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ACTIONS = ['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVISED'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVER_TYPES = ['TEAM_MANAGER', 'ROLE'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID'];

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TARGET_PERIOD_TYPES = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type TargetPeriodType = (typeof TARGET_PERIOD_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'INVOICE_OVERDUE',
  'LEAD_ASSIGNED',
  'TARGET_SET',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
