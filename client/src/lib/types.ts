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
  type: string;
  paymentTermId: string | null;
  paymentTerm?: PaymentTermRef | null;
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
  productId?: string | null;
  product?: ProductRef | null;
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
  contract?: { id: string; number: string; status: string } | null;
  salesOrders?: { id: string; number: string; status: string }[];
  approvalRequests?: ApprovalRequest[];
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  customerId: string;
  customer: { id: string; name: string; email?: string | null; address?: string | null; taxId?: string | null; credit?: CustomerCredit | null; paymentTerm?: PaymentTermRef | null };
  quotation?: { id: string; number: string; version: number } | null;
  salesOrder?: { id: string; number: string } | null;
  paymentTerm?: PaymentTermRef | null;
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

export interface PaymentTermRef {
  id: string;
  name: string;
  days: number;
}

export interface PaymentTerm extends PaymentTermRef {
  isActive: boolean;
  customerCount?: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  description: string | null;
  listPrice: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProductRef {
  id: string;
  code: string;
  name?: string;
  unit: string;
}

export interface Contract {
  id: string;
  number: string;
  title: string;
  status: string;
  quotationId: string;
  customerId: string;
  customer: { id: string; name: string };
  owner: UserRef;
  createdBy?: UserRef;
  startDate: string;
  endDate: string | null;
  value: string;
  currency: string;
  terms: string | null;
  documentUrl: string | null;
  cancelReason: string | null;
  createdAt: string;
  quotation?: { id: string; number: string; version: number; total: string; currency: string };
  orders?: { id: string; number: string; status: string; total: string; orderDate: string }[];
}

export interface SalesOrderItem {
  id: string;
  position: number;
  productId: string | null;
  product: ProductRef | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  lineTotal?: string;
}

export interface SalesOrder {
  id: string;
  number: string;
  status: string;
  customerId: string;
  customer: { id: string; name: string };
  owner: UserRef;
  createdBy?: UserRef;
  contract: { id: string; number: string } | null;
  quotation?: { id: string; number: string; version: number } | null;
  orderDate: string;
  deliveryDate: string | null;
  currency: string;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  items?: SalesOrderItem[];
  invoices?: { id: string; number: string; status: string; total: string }[];
  warnings?: string[];
}
