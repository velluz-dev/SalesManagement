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
| Status codes | `200` OK · `201` created · `204` no content · `400` validation (`VALIDATION_ERROR`) · `401` not signed in · `403` missing permission / cross-site request · `404` not found **or outside your data scope** · `409` conflict (duplicate, already decided) · `413` body too large · `422` business-rule violation (`BUSINESS_RULE_VIOLATION`) · `429` rate limited |
| Strict bodies | Unknown fields are rejected with 400. Server-controlled fields (`ownerId` without `lead.assign`, `status`, totals) cannot be set by clients. |
| CSRF | State-changing requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected (403). |

**Scope** column: `own/team/all` means results are filtered to the caller's widest read scope for that resource (see the permission matrix in [ARCHITECTURE.md](ARCHITECTURE.md)).

## Authentication

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → sets session cookie. Rate limited (10 failures / 15 min / IP+email). Generic error on failure. |
| POST | `/auth/logout` | — | Deletes the session. `204`. |
| GET | `/auth/me` | session | `{ user, roles, permissions[], managedTeamIds }`. Used by the UI to render menus and actions. |
| POST | `/auth/change-password` | session | `{ currentPassword, newPassword }`. Signs out other sessions. |

## Users, roles, teams

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `user.read` | Filters: `isActive`, `roleId`, `teamId`. |
| GET | `/users/:id` | `user.read` | |
| POST | `/users` | `user.create` (+`role.assign` to pass `roleIds`) | `{ email, name, password, teamId?, roleIds?, mustChangePassword? }` |
| PATCH | `/users/:id` | `user.update` | `{ name?, email?, teamId? }` |
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
| GET | `/customers/:id` | `customer.read.*` | Includes credit if `credit.read`. |
| POST | `/customers` | `customer.create` | `ownerId` only with `lead.assign` (team members). |
| PATCH | `/customers/:id` | `customer.update` | Within read scope. |
| GET | `/leads`, `/leads/:id` | `lead.read.*` | Filters: `status`, `source`, `ownerId`. |
| POST | `/leads` | `lead.create` | Assignee is notified. |
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
| GET | `/quotations/:id` | `quotation.read.*` | Items with computed line totals and full approval history. |
| POST | `/quotations` | `quotation.create` | `{ customerId, opportunityId?, validUntil?, notes?, terms?, items:[{ description, quantity, unitPrice, discountPercent?, taxRate? }] }`. Totals computed server-side. |
| PATCH | `/quotations/:id` | `quotation.update` | DRAFT/REJECTED only (422 otherwise). Items are replaced wholesale. |
| POST | `/quotations/:id/submit` | `quotation.submit` | `{ comment? }`. Approver resolved by approval rules. 422 if no rule or no eligible approver. |
| POST | `/quotations/:id/withdraw` | `quotation.submit` | PENDING_APPROVAL → DRAFT. |
| POST | `/quotations/:id/send` | `quotation.update` | APPROVED → SENT. |
| POST | `/quotations/:id/customer-response` | `quotation.update` | `{ outcome: ACCEPTED\|DECLINED }` from APPROVED/SENT. |
| POST | `/quotations/:id/cancel` | `quotation.update` | DRAFT/REJECTED → CANCELLED. |
| POST | `/quotations/:id/revise` | `quotation.update` | APPROVED/SENT/DECLINED (not invoiced) → new DRAFT version, old becomes SUPERSEDED. `201`. |
| GET | `/approvals` | `approval.read.assigned` / `.all` | `view=assigned\|all`, `status`. Each row has `canDecide`. |
| GET | `/approvals/:id` | assigned approver, requester/owner, or `approval.read.all` | Includes `canDecide` and `decisionBlocker`. |
| POST | `/approvals/:id/decision` | `approval.decide` + assignment | `{ decision: APPROVE\|REJECT, comment? }`. A comment is required to reject. Self-approval blocked unless enabled. `409` if already decided. |
| GET | `/approval-rules` | `settings.read` or `approval.read.all` | |
| POST / PUT / DELETE | `/approval-rules[/:id]` | `settings.manage` | `{ name, minAmount, maxAmount?, approverType: TEAM_MANAGER\|ROLE, approverRoleId, priority, isActive }`. Role must hold `approval.decide`. |

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
| POST | `/invoices` | `invoice.create` | `{ quotationId, notes? }` (APPROVED/ACCEPTED, not already invoiced) **or** `{ customerId, salespersonId?, items, notes? }`. Creates a DRAFT. |
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
| GET | `/dashboard` | session | Sections `sales`, `approvals`, `finance`, `admin`, each present only if permitted (otherwise `null`). |
| GET | `/reports/sales?from&to` | `report.sales.*` | By salesperson, monthly won, pipeline. Scoped own/team/all. |
| GET | `/reports/finance?from&to` | `report.finance` | Totals, invoiced vs collected by month, aging, payment methods, top debtors. |
| GET | `/notifications` | session (own only) | `unread=true`; response includes `unread` count. |
| GET | `/notifications/unread-count` | session | |
| POST | `/notifications/:id/read`, `/notifications/read-all` | session | |
| GET | `/audit-logs` | `audit.read` | Filters: `action` (prefix), `entityType`, `entityId`, `actorId`, `from`, `to`, `q`. |
| GET | `/audit-logs/facets` | `audit.read` | Distinct actions and entity types. |
| GET | `/settings/public` | session | Company name, currency, quotation defaults, demo flag. |
| GET | `/settings` | `settings.read` | Definitions and values. |
| PUT | `/settings` | `settings.manage` | `{ "<key>": value, … }`. Only catalogue keys are accepted, each validated by type. |
| GET | `/health` | — | Liveness. |
