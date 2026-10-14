# REST API Reference

Base URL: `/api`. All endpoints except `POST /auth/login`, `POST /auth/logout` and `GET /health` require a valid session cookie.

## Conventions

| Topic | Convention |
|---|---|
| Format | JSON request/response bodies. Money values are **decimal strings** in responses (e.g. `"10165.00"`) and accept a number or string in requests (max 2 decimals). Dates are `YYYY-MM-DD`; timestamps are ISO-8601. |
| Single resource | `{ "data": { … } }` |
| Lists | `{ "data": [ … ], "meta": { "page", "pageSize", "total", "totalPages" } }` |
| Pagination | `?page=1&pageSize=20` (max 100) |
| Search / sort | `?q=text&sort=<whitelisted field>&order=asc\|desc` |
| Errors | `{ "error": { "code", "message", "details?" } }`. Validation `details` is `[{ path, message }]`. |
| Status codes | `200` OK, `201` created, `204` no content, `400` validation (`VALIDATION_ERROR`), `401` not signed in, `403` missing permission / cross-site request, `404` not found **or outside your data scope**, `409` conflict (duplicate, already decided), `413` body too large, `422` business-rule violation (`BUSINESS_RULE_VIOLATION`), `429` rate limited |
| Strict bodies | Unknown fields are rejected with 400. Server-controlled fields (`ownerId` without `lead.assign`, `status`, totals) cannot be set by clients. |
| CSRF | State-changing requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected (403). |

**Scope** column: `own/team/all` means results are filtered to the caller's widest read scope for that resource (see the permission matrix in [ARCHITECTURE.md](ARCHITECTURE.md)).

## Authentication

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/auth/login` | None | `{ identifier, password }`, where `identifier` is an email or a username (case-insensitive). Sets the session cookie. Rate limited (10 failures / 15 min / IP+identifier). Generic error on failure. |
| POST | `/auth/logout` | None | Deletes the session. `204`. |
| GET | `/auth/me` | session | `{ user, roles, permissions[], managedTeamIds }`. Used by the UI to render menus and actions. |
| POST | `/auth/change-password` | session | `{ currentPassword, newPassword }`. Signs out other sessions. |

## Users, roles, teams

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `user.read` | Filters: `isActive`, `roleId`, `teamId`. `q` searches name, username and email. |
| GET | `/users/:id` | `user.read` | |
| POST | `/users` | `user.create` (+`role.assign` to pass `roleIds`) | `{ email, username, name, password, teamId?, roleIds?, mustChangePassword? }`. Usernames are 3 to 32 lowercase letters, numbers, dots or underscores. A taken email or username returns `409` with field details. |
| PATCH | `/users/:id` | `user.update` | `{ name?, username?, email?, teamId? }` |
| PUT | `/users/:id/roles` | `role.assign` | `{ roleIds }`. Not on yourself. Last role manager is protected (422). |
| PATCH | `/users/:id/status` | `user.deactivate` | `{ isActive }`. Not on yourself. Deactivation revokes sessions. |
| POST | `/users/:id/reset-password` | `user.update` | `{ password }`. Forces change at next sign-in and revokes sessions. |
| GET | `/roles` | `role.read` | Roles with permission codes and user counts. |
| GET | `/roles/permissions` | `role.read` | Grouped permission catalogue. |
| POST | `/roles` | `role.manage` | `{ code, name, description?, permissions[] }` |
| PATCH | `/roles/:id` | `role.manage` | `{ name?, description?, permissions? }`. Forbidden on a role you hold. |
| DELETE | `/roles/:id` | `role.manage` | Custom roles without users only. |
| GET | `/teams`, `/teams/:id` | `team.read` | |
| POST / PATCH / DELETE | `/teams[/:id]` | `team.manage` | `{ name, managerId?, memberIds? }` |

## Sales

| Method | Path | Permission | Scope / notes |
|---|---|---|---|
| GET | `/customers` | `customer.read.*` | own/team/all. Filters: `isActive`, `ownerId`, `industry`. |
| GET | `/customers/:id` | `customer.read.*` | Includes credit if `credit.read`, and an `account` summary for everyone in scope: outstanding and overdue balance, credit limit, available credit, hold status. |
| POST | `/customers` | `customer.create` | `ownerId` only with `lead.assign` (team members). |
| PATCH | `/customers/:id` | `customer.update` | Within read scope. |
| GET | `/leads`, `/leads/:id` | `lead.read.*` | Filters: `status`, `source`, `ownerId`, `followUp=due\|overdue`. Sortable by `nextFollowUpAt`. |
| POST | `/leads` | `lead.create` | Assignee is notified. Optional `nextFollowUpAt` (ISO datetime) schedules a follow-up reminder. |
| PATCH | `/leads/:id` | `lead.update` | Converted leads are read-only (422). |
| POST | `/leads/:id/convert` | `lead.convert` | `{ customerId \| customer:{…}, opportunity?:{ name, amount, expectedCloseDate? } }`, atomic. |
| GET | `/opportunities`, `/opportunities/:id` | `opportunity.read.*` | Filters: `stage`, `status=open\|won\|lost`, `customerId`, `ownerId`. |
| GET | `/opportunities/pipeline` | `opportunity.read.*` | Per stage: count, total, weighted, items. |
| POST / PATCH | `/opportunities[/:id]` | `opportunity.create` / `.update` | Moving to a closed stage sets `closedAt`. |
| GET | `/activities` | `activity.read.*` | `state=open\|completed\|overdue`, links filters. |
| POST / PATCH / DELETE | `/activities[/:id]` | `activity.manage` | Linked records must be in scope. |
| GET | `/lookups/users\|customers\|opportunities\|teams` | session | Scoped pickers for forms. |

## Quotations and approvals

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/quotations` | `quotation.read.*` | own/team/all. Filters: `status`, `customerId`, `ownerId`, `opportunityId`, `includeSuperseded`. |
| GET | `/quotations/:id` | `quotation.read.*` | Items with computed line totals, full approval history, agreed `paymentTerm`, and a `credit` check (limit, outstanding, available, warnings) while the deal is open. |
| POST | `/quotations` | `quotation.create` | `{ customerId, opportunityId?, validUntil?, paymentTermId?, notes?, terms?, items:[{ description, quantity, unitPrice, discountPercent?, taxRate? }] }`. Totals computed server-side. `paymentTermId` defaults to the customer's term and carries through to contracts, orders and the invoice due date. |
| PATCH | `/quotations/:id` | `quotation.update` | DRAFT/REJECTED only (422 otherwise). Items are replaced wholesale. |
| POST | `/quotations/:id/submit` | `quotation.submit` | `{ comment? }`. Approver resolved by approval rules. 422 if no rule or no eligible approver. Response includes credit `warnings`, which are also sent to the approver. |
| POST | `/quotations/:id/withdraw` | `quotation.submit` | Moves PENDING_APPROVAL back to DRAFT. |
| POST | `/quotations/:id/send` | `quotation.update` | Moves APPROVED to SENT. 422 once the validity date has passed. APPROVED/SENT offers past `validUntil` become EXPIRED automatically. |
| POST | `/quotations/:id/customer-response` | `quotation.update` | `{ outcome: ACCEPTED\|DECLINED }` from APPROVED/SENT. |
| POST | `/quotations/:id/cancel` | `quotation.update` | Moves DRAFT or REJECTED to CANCELLED. |
| POST | `/quotations/:id/revise` | `quotation.update` | APPROVED/SENT/DECLINED/EXPIRED (not invoiced) becomes a new DRAFT version, old becomes SUPERSEDED. `201`. |
| GET | `/approvals` | `approval.read.assigned` / `.all` | `view=assigned\|all`, `status`. Each row has `canDecide`. |
| GET | `/approvals/:id` | assigned approver, requester/owner, or `approval.read.all` | Includes `canDecide` and `decisionBlocker`. |
| POST | `/approvals/:id/decision` | `approval.decide` + assignment | `{ decision: APPROVE\|REJECT, comment? }`. A comment is required to reject. Self-approval blocked unless enabled. `409` if already decided. |
| GET | `/approval-rules` | `settings.read` or `approval.read.all` | |
| POST / PUT / DELETE | `/approval-rules[/:id]` | `settings.manage` | `{ name, minAmount, maxAmount?, approverType: TEAM_MANAGER\|ROLE, approverRoleId, priority, isActive }`. Role must hold `approval.decide`. |

## Products and payment terms

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/products` | `product.read` or `product.manage` | Filters: `q`, `category`, `isActive` (managers only; others see sellable products). Sort: `name`, `code`, `listPrice`, `createdAt`. |
| GET | `/products/categories` | same | Distinct categories. |
| GET | `/products/:id` | same | |
| POST / PATCH | `/products[/:id]` | `product.manage` | `{ code, name, unit, category?, description?, listPrice, isActive }`. Code is upper-cased and unique (409 on duplicates). Price changes are audited as `product.price_changed`. |
| GET | `/payment-terms` | session | Active terms; `?all=true` includes inactive ones for `credit.manage` holders. Each term includes `customerCount`. |
| POST / PATCH | `/payment-terms[/:id]` | `credit.manage` | `{ name, days (0–365), isActive }` |
| DELETE | `/payment-terms/:id` | `credit.manage` | 409 if used by customers or invoices (deactivate instead). |

A customer's payment term is set with `PUT /credit/:customerId` (`paymentTermId`, nullable).

## Contracts

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/contracts` | `contract.read.*` | own/team/all. Filters: `status`, `customerId`, `ownerId`, `q`. |
| GET | `/contracts/:id` | `contract.read.*` | Includes quotation and orders. |
| POST | `/contracts` | `contract.manage` | `{ quotationId, title?, startDate?, endDate?, terms?, documentUrl? }`. Quotation must be ACCEPTED, in scope, and not already contracted. |
| PATCH | `/contracts/:id` | `contract.manage` | ACTIVE only: `{ title?, endDate?, terms?, documentUrl? }` (http/https links only). |
| POST | `/contracts/:id/complete` | `contract.manage` | ACTIVE → COMPLETED. |
| POST | `/contracts/:id/cancel` | `contract.manage` | `{ reason }`. Only when all its orders are cancelled. |

## Sales orders

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/sales-orders` | `order.read.*` | own/team/all. Filters: `status`, `customerId`, `contractId`, `ownerId`, `q`. |
| GET | `/sales-orders/:id` | `order.read.*` | Items (with product code and line totals), contract, quotation, invoices. |
| POST | `/sales-orders` | `order.create` | One of `{ contractId }`, `{ quotationId }` (ACCEPTED, not directly invoiced) or `{ customerId, items }`, plus `orderDate?`, `deliveryDate?`, `notes?`. |
| PATCH | `/sales-orders/:id` | `order.update` | PENDING only: `{ deliveryDate?, notes?, items? }`. |
| POST | `/sales-orders/:id/confirm` | `order.update` | Credit check; returns `warnings[]`, or 422 when blocking is configured. |
| POST | `/sales-orders/:id/deliver` | `order.update` | CONFIRMED → DELIVERED, `{ deliveryDate? }`. |
| POST | `/sales-orders/:id/cancel` | `order.update` | `{ reason }`. PENDING/CONFIRMED and not invoiced. |

## Targets

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/targets` | `target.read.*` | own/team/all; returns `achieved` and `percent`. Filters: `year`, `periodType`, `userId`, `teamId`, `current`. |
| POST / PUT | `/targets[/:id]` | `target.manage` | `{ userId \| teamId, periodType, year, period, amount, notes? }`. Not for yourself; team scope unless `target.read.all`. |
| DELETE | `/targets/:id` | `target.manage` | |

## Finance

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/invoices` | `invoice.read` | Filters: `status`, `customerId`, `overdue`, `unpaid`, `from`, `to`. Rows include derived `balance`, `isOverdue`, `daysOverdue`. |
| GET | `/invoices/:id` | `invoice.read` | Items, payments, customer credit. |
| POST | `/invoices` | `invoice.create` | `{ salesOrderId, notes? }` (CONFIRMED/DELIVERED, once), **or** `{ quotationId, notes? }` (APPROVED/ACCEPTED, not already invoiced, not fulfilled through orders), **or** `{ customerId, salespersonId?, items, notes? }`. Creates a DRAFT. Lines may carry `productId`. |
| PATCH | `/invoices/:id` | `invoice.update` | DRAFT only. |
| POST | `/invoices/:id/issue` | `invoice.update` | `{ issueDate?, dueDate? }`. Due date defaults from customer terms. Credit check returns `warnings[]`, or 422 if blocking is configured. |
| POST | `/invoices/:id/cancel` | `invoice.cancel` | `{ reason }`. DRAFT or unpaid ISSUED. |
| GET | `/payments` | `payment.read` | Filters: `invoiceId`, `customerId`, `method`, `from`, `to`, `includeVoided`. |
| POST | `/payments` | `payment.create` | `{ invoiceId, amount, method, paidAt, reference?, notes? }`. Cannot exceed balance or be future-dated. Updates invoice status. |
| POST | `/payments/:id/void` | `payment.void` | `{ reason }`. Re-opens the balance. |
| GET | `/credit` | `credit.read` | Customers with limit, exposure, overdue, available, utilization. Filters: `onHold`, `overLimit`. |
| GET | `/credit/:customerId` | `credit.read` | Plus open invoices (if `invoice.read`). |
| PUT | `/credit/:customerId` | `credit.manage` | `{ creditLimit, paymentTermsDays, onHold, notes? }` |

## Reports, dashboard, notifications, audit, settings

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard` | session | Sections `sales`, `approvals`, `finance`, `admin`, each present only if permitted (otherwise `null`). `sales.followUps` lists due and overdue follow-ups in scope; `sales.team` gives per-salesperson (and, for company scope, per-team) achievement against target, open pipeline and overdue follow-ups. |
| GET | `/reports/sales?from&to` | `report.sales.*` | By salesperson, monthly won, pipeline, and a `forecast` of open deals by expected close month (amount and probability-weighted). Scoped own/team/all. |
| GET | `/reports/finance?from&to` | `report.finance` | Totals, invoiced vs collected by month, aging, payment methods, top debtors. |
| GET | `/notifications` | session (own only) | `unread=true`; response includes `unread` count. |
| GET | `/notifications/unread-count` | session | |
| POST | `/notifications/:id/read`, `/notifications/read-all` | session | |
| GET | `/audit-logs` | `audit.read` | Filters: `action` (prefix), `entityType`, `entityId`, `actorId`, `from`, `to`, `q`. |
| GET | `/audit-logs/facets` | `audit.read` | Distinct actions and entity types. |
| GET | `/settings/public` | session | Company name, currency, quotation defaults. |
| GET | `/settings` | `settings.read` | Definitions and values. |
| PUT | `/settings` | `settings.manage` | `{ "<key>": value, … }`. Only catalogue keys are accepted, each validated by type. |
| GET | `/health` | None | Liveness. |
