# Architecture and design

## 1. Architecture overview

```
SalesManagement/                 client/ and server/ install separately; the root package.json only runs scripts
├── server/                      Express 5 + TypeScript REST API, Prisma ORM, PostgreSQL
│   ├── prisma/                  schema/ (split by domain), migrations, seed.ts
│   └── src/
│       ├── config/              env parsing (zod)
│       ├── lib/                 prisma client, errors, pagination, money, audit, notifications, scope
│       ├── middleware/          authenticate, requirePermission, validate, origin check, rate limit, errors
│       ├── modules/<module>/    routes.ts, service.ts, schemas.ts (one folder per business module)
│       ├── shared/              permission catalogue, role defaults, enums, settings (also imported by the client as @shared)
│       └── jobs/                overdue-invoice scanner
└── client/                      React 19 + Vite + Tailwind 4 SPA
    └── src/
        ├── lib/                 fetch wrapper, formatting, form helpers, response types
        ├── auth/                AuthProvider, permission hooks, route guards
        ├── components/          ui/ (design system), layout/ (sidebar, topbar)
        └── features/<module>/   pages and module components
```

**Request pipeline**, in order:

1. `helmet` security headers, CORS allow-list, JSON body limit, cookie parser.
2. Origin check (CSRF) and rate limiter.
3. `authenticate` reads the session cookie, then `requirePermission(...)` checks the endpoint's permissions.
4. Zod validates the request body or query.
5. The service runs scoped queries inside a transaction and writes the audit log.
6. A consistent JSON response is returned, or the error handler formats the failure.

**Authentication:** server-side sessions. On login the server generates a 256-bit random token, stores
its SHA-256 hash in the `Session` table and sets the raw token in an `HttpOnly`, `SameSite=Lax`,
`Secure` (in production) cookie. Sessions have a sliding idle timeout and an absolute lifetime and can be revoked instantly
(logout, password change, account deactivation). Passwords are hashed with **Argon2id**.
CSRF: SameSite cookie + the server rejects state-changing requests whose `Origin` is not on the allow-list.

**Authorization:** permissions are the unit of authorization (never role names in business code).
Each request loads the user's effective permission set (union over active roles). Endpoints declare required
permissions; services additionally apply **data scope** (own / team / all) inside the Prisma `where`
clause, so out-of-scope records are invisible (404) rather than merely hidden in the UI.

## 2. Roles & permission matrix

Scope suffixes: `.own` = records the user owns, `.team` = records owned by members of teams the user manages
(plus own), `.all` = everything. Write permissions (`update`, `delete`) apply within the user's read scope.

| Permission | Salesperson | Sales Manager | Finance | Director | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| customer.read.own / .team / .all | own | team | all | all |  |
| customer.create / customer.update | ✔ | ✔ | update |  |  |
| lead.read.own / .team / .all | own | team |  | all |  |
| lead.create / lead.update / lead.convert | ✔ | ✔ |  |  |  |
| lead.assign (re-assign owner within team) |  | ✔ |  |  |  |
| opportunity.read.own / .team / .all | own | team |  | all |  |
| opportunity.create / opportunity.update | ✔ | ✔ |  |  |  |
| activity.read.own / .team / .all | own | team |  |  |  |
| activity.manage | ✔ | ✔ |  |  |  |
| quotation.read.own / .team / .all | own | team | all | all |  |
| quotation.create / update / submit | ✔ | ✔ |  |  |  |
| approval.read.assigned |  | ✔ |  | ✔ |  |
| approval.decide |  | ✔ |  | ✔ |  |
| approval.read.all |  |  |  | ✔ |  |
| target.read.own / .team / .all | own | team |  | all |  |
| target.manage (team scope / all) |  | team |  |  |  |
| invoice.read / create / update / cancel |  |  | ✔ | read |  |
| payment.read / create / void |  |  | ✔ | read |  |
| credit.read / credit.manage |  | read | ✔ | read |  |
| report.sales.own / .team / .all | own | team |  | all |  |
| report.finance |  |  | ✔ | ✔ |  |
| user.read / create / update / deactivate |  |  |  |  | ✔ |
| role.read / role.assign / role.manage |  |  |  |  | ✔ |
| team.read / team.manage |  | read |  | read | ✔ |
| `/lookups/users` (scoped user picker, no permission) | self | team | all active | all active | all |
| audit.read |  |  |  |  | ✔ |
| settings.read / settings.manage |  |  |  | read | ✔ |

The defaults are seeded and the Administrator can edit role permissions at runtime.
The Administrator role has **no business approval authority** (`approval.decide` is not granted, and admin is not
a target of any approval rule).

### Anti-escalation rules (enforced server-side)
1. A user cannot change their own roles, deactivate themselves, or edit the permission set of a role they hold.
2. Only `role.assign` holders may assign roles and only `role.manage` holders may edit role permissions.
3. The last active user holding `role.manage` cannot be deactivated or stripped of it.
4. Request bodies are parsed with strict zod schemas: unknown fields such as `ownerId`, `status`, `total`, `roles` are
   rejected or ignored, so mass assignment is not possible.
5. Ownership (`ownerId`) is set server-side. Only `lead.assign` holders may set it, and only to members of their teams.

## 3. Business rules & documented assumptions

The brief leaves these points open. Where a rule is a policy decision it is **configurable** (SystemSetting or
ApprovalRule table) rather than hard-coded.

| # | Rule | Configurable via |
|---|---|---|
| B1 | Approver is resolved from **ApprovalRule** rows by quotation total (`minAmount ≤ total < maxAmount`). Seed: `< 50,000` to submitter's team manager (Sales Manager); `≥ 50,000` to any Director. Single-step approval. | Settings > Approval rules |
| B2 | If the rule targets the team manager but none exists, or the manager is the requester, the request goes to the **fallback role** (default `DIRECTOR`). | `approval.fallbackRoleCode` |
| B3 | Self-approval is blocked (requester or quotation owner ≠ approver) unless enabled. | `approval.allowSelfApproval` (default false) |
| B4 | Quotation lifecycle: `DRAFT to PENDING_APPROVAL to APPROVED / REJECTED`; `REJECTED`, edit, then resubmit; `APPROVED to SENT to ACCEPTED / DECLINED`; `DRAFT/REJECTED to CANCELLED`. Only DRAFT and REJECTED are editable. | Fixed |
| B5 | Controlled revision: an APPROVED/SENT/DECLINED quotation can be **revised**, which creates a new DRAFT version (same number, version + 1) and marks the old one `SUPERSEDED`. History is kept. | Fixed |
| B6 | Quotation and invoice totals are derived from line items by one pure function (`calculateTotals`) and **persisted only inside the same transaction that writes the items**. Items cannot be edited independently, so the cache cannot drift. `Invoice.amountPaid` is likewise updated only in the payment transaction. | Fixed |
| B7 | Invoices are created by Finance from an ACCEPTED or APPROVED quotation (items copied) or manually. Lifecycle: `DRAFT to ISSUED to PARTIALLY_PAID to PAID`; `DRAFT/ISSUED(no payments) to CANCELLED`. | Fixed |
| B8 | "Overdue" is **derived**, never stored: issued/partially-paid with `dueDate < today`. | Fixed |
| B9 | Payments cannot exceed the outstanding balance (no overpayment/credit notes in scope). Voiding a payment requires a reason and re-opens the balance. | Fixed |
| B10 | Credit exposure = sum of outstanding balances of the customer's issued invoices. Issuing an invoice that exceeds the limit (or for a customer on credit hold) returns a warning, or is blocked if configured. | `credit.blockOnExceed` (default false) |
| B11 | Target achievement basis: amount of opportunities **Closed Won** in the period (default) or invoiced amount. | `targets.achievementBasis` |
| B12 | Default quotation validity 30 days, default tax rate 0%, default payment terms 30 days, currency USD. | settings |
| B13 | Teams: each salesperson belongs to at most one team, and each team has one manager. "Team scope" = members of teams the user manages. | Admin > Teams |
| B14 | Target setters cannot set their own target; managers set targets only for their team members/teams (company-wide setters need `target.read.all`). | role permissions |
| B15 | Payments cannot be future-dated; invoices created from a quotation keep the quotation's line items (edits only to notes while draft). | Fixed |
| B16 | A quotation that has a non-cancelled invoice cannot be revised. | Fixed |
| B17 | Password policy: 10 to 128 characters with letters and digits; new accounts must change the temporary password at first sign-in (default). | Fixed |

## 4. Database design (PostgreSQL via Prisma)

Core tables (all have `createdAt`/`updatedAt`; money is `NUMERIC(14,2)`, percentages `NUMERIC(5,2)`):

- **Identity:** `User`, `Role`, `Permission`, `UserRole` (PK userId+roleId), `RolePermission` (PK roleId+permissionId),
  `Team` (managerId to User), `Session` (tokenHash unique, expiresAt).
- **Sales:** `Customer` (ownerId), `Lead` (ownerId, convertedCustomerId), `Opportunity` (customerId, ownerId, stage),
  `Activity`, `Quotation` (number+version unique, status enum, ownerId, customerId, opportunityId, parentId,
  cached subtotal/discount/tax/total), `QuotationItem`.
- **Approval:** `ApprovalRule`, `ApprovalRequest` (quotationId, ruleId, approverRoleId, assignedToId nullable = role pool,
  status enum, amount snapshot), `ApprovalHistory` (append-only action log).
- **Targets:** `SalesTarget` (userId XOR teamId, periodStart/periodEnd, amount). Check constraint enforces XOR.
- **Finance:** `Invoice` (number unique, status enum, customerId, quotationId, salespersonId, dueDate, cached totals,
  amountPaid), `InvoiceItem`, `Payment` (method enum, voidedAt), `CustomerCredit` (customerId unique, creditLimit,
  paymentTermsDays, onHold).
- **Platform:** `Notification` (userId, type, link, readAt, dedupeKey unique per user), `AuditLog` (actorId, action,
  entityType, entityId, before/after JSONB, ip), `SystemSetting` (key PK, JSONB value).

Indexes are created on every foreign key, status columns, `dueDate`, `createdAt` (audit) and `(userId, readAt)` (notifications).
Check constraints enforce non-negative amounts, quantity > 0, and `amountPaid ≤ total`.
