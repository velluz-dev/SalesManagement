export interface UserRef {
  id: string;
  name: string;
  email?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  industry: string | null;
  address: string | null;
  taxId: string | null;
  isActive: boolean;
  ownerId: string;
  owner: UserRef;
  createdAt: string;
  credit?: CustomerCredit | null;
  _count?: { opportunities: number; quotations: number; invoices: number; leads?: number };
}

export interface CustomerCredit {
  id: string;
  customerId: string;
  creditLimit: string;
  paymentTermsDays: number;
  onHold: boolean;
  notes: string | null;
  updatedAt: string;
}

export interface Lead {
  id: string;
  title: string;
  contactName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  estimatedValue: string | null;
  notes: string | null;
  ownerId: string;
  owner: UserRef;
  convertedCustomer?: { id: string; name: string } | null;
  opportunities?: { id: string; name: string; stage: string; amount: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  name: string;
  customerId: string;
  customer: { id: string; name: string };
  ownerId: string;
  owner: UserRef;
  stage: string;
  amount: string;
  probability: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
  notes: string | null;
  lead?: { id: string; title: string } | null;
  quotations?: { id: string; number: string; version: number; status: string; total: string }[];
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  dueAt: string | null;
  completedAt: string | null;
  owner: UserRef;
  customer: { id: string; name: string } | null;
  lead: { id: string; title: string } | null;
  opportunity: { id: string; name: string } | null;
}

export interface QuotationItem {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  lineTotal?: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
  actor: UserRef;
}

export interface ApprovalRequest {
  id: string;
  quotationId: string;
  quotationVersion: number;
  amount: string;
  status: string;
  requestedBy: UserRef;
  assignedTo: UserRef | null;
  decidedBy: UserRef | null;
  approverRole: { id: string; code: string; name: string };
  rule: { id: string; name: string; minAmount?: string; maxAmount?: string | null } | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  history: ApprovalHistoryEntry[];
  canDecide?: boolean;
  decisionBlocker?: string | null;
  quotation?: {
    id: string;
    number: string;
    version: number;
    status: string;
    total: string;
    currency: string;
    customer: { id: string; name: string };
    owner: UserRef;
  };
}

export interface Quotation {
  id: string;
  number: string;
  version: number;
  status: string;
  customerId: string;
  customer: { id: string; name: string; email?: string | null; address?: string | null };
  opportunityId: string | null;
  opportunity?: { id: string; name: string; stage: string } | null;
  ownerId: string;
  owner: UserRef;
  issueDate: string;
  validUntil: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  items?: QuotationItem[];
  parent?: { id: string; number: string; version: number; status: string } | null;
  revision?: { id: string; number: string; version: number; status: string } | null;
  invoices?: { id: string; number: string; status: string; total: string }[];
  approvalRequests?: ApprovalRequest[];
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  customerId: string;
  customer: { id: string; name: string; email?: string | null; address?: string | null; taxId?: string | null; credit?: CustomerCredit | null };
  quotation?: { id: string; number: string; version: number } | null;
  salesperson: UserRef | null;
  createdBy?: UserRef;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  balance: string;
  isOverdue: boolean;
  daysOverdue: number;
  cancelReason?: string | null;
  items?: QuotationItem[];
  payments?: Payment[];
  createdAt: string;
  warnings?: string[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: string;
  method: string;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  recordedBy: UserRef;
  voidedBy: UserRef | null;
  invoice?: { id: string; number: string; customer: { id: string; name: string } };
}

export interface SalesTarget {
  id: string;
  userId: string | null;
  teamId: string | null;
  user: UserRef | null;
  team: { id: string; name: string } | null;
  periodType: 'MONTH' | 'QUARTER' | 'YEAR';
  periodStart: string;
  periodEnd: string;
  amount: string;
  achieved: string;
  percent: number;
  notes: string | null;
  setBy: UserRef;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  name: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
  roles: { id: string; code: string; name: string }[];
  createdAt: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface Team {
  id: string;
  name: string;
  managerId: string | null;
  manager: UserRef | null;
  members: (UserRef & { isActive: boolean })[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: UserRef | null;
}
