# SalesHub CRM

A role-based sales management system for B2B selling. It covers the whole revenue cycle: leads, opportunities, a product catalog, quotations with an approval workflow, contracts, sales orders, invoices on customer payment terms (Net 30, COD, ...), payments including KPay, and collections. Access control is enforced on the server.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, TanStack Query, React Hook Form, Zod, Recharts |
| Backend | Node.js, Express 5, TypeScript, Zod validation |
| Database | PostgreSQL (tested on 18) via Prisma 6 |
| Auth | Server-side sessions (HttpOnly cookie, SHA-256-hashed token in DB), Argon2id password hashing |
| Tests | Vitest + Supertest (API integration against a real test database), Vitest + Testing Library (client) |

Design documents:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, **permission matrix**, business rules and assumptions, database design.
- [docs/API.md](docs/API.md): REST endpoint reference.

---

## 1. Prerequisites

- Node.js **20.19+** (developed on Node 25) and npm 10+
- PostgreSQL **14+**, either a local install or `docker compose up -d db` (see below)

## 2. Setup

```bash
# 1. Install dependencies for server/ and client/ (each gets its own node_modules)
npm install

# 2. Configure the server environment
cp server/.env.example server/.env              # then edit DATABASE_URL if needed
cp server/.env.test.example server/.env.test    # test database (must end in _test)
```

`server/.env` keys:

| Key | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (server-only, never exposed to the browser) | `postgresql://postgres@localhost:5432/sales_crm` |
| `PORT` | API port | `4000` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed for CORS **and** the CSRF origin check | `http://localhost:5180` |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS` | Session idle timeout / absolute lifetime | `120` / `12` |
| `COOKIE_SECURE` | Mark cookies `Secure` (always on when `NODE_ENV=production`) | `false` |
| `OVERDUE_SCAN_MINUTES` | Overdue-invoice notification scan interval (0 = off) | `60` |
| `BUSINESS_TIMEZONE` | Time zone for calendar dates (today, due dates, overdue) | `Asia/Yangon` |

> **Using Docker for PostgreSQL:** `docker compose up -d db`, then set
> `DATABASE_URL=postgresql://crm:crm@localhost:5432/sales_crm?schema=public`.

## 3. Database migrations

```bash
npm run db:migrate          # prisma migrate dev: creates the DB if needed and applies migrations
# production / CI:
npm run db:deploy                      # prisma migrate deploy
```

The Prisma schema is split by domain in `server/prisma/schema/` (`identity`, `sales`, `quotations`, `approvals`, `targets`, `finance`, `platform`), and migrations live in `server/prisma/migrations`. The initial migration adds CHECK constraints (non-negative money, `amountPaid ≤ total`, target owner XOR, …) and a partial unique index guaranteeing **at most one pending approval per quotation**. A second migration creates the sequences used for concurrency-safe quotation and invoice numbers, and a third adds unique usernames, backfilling existing users from their email address.

## 4. Seed data (development only)

```bash
npm run db:seed
```

This **wipes business data** and loads fictional demo data: 16 customers, leads, 40 opportunities, quotations in every status with approval history, invoices that are paid, partially paid or overdue, payments, and targets. The seed refuses to run when `NODE_ENV=production`. All emails use the reserved `.local` and `example.com` domains, and the UI shows a **"Demo environment"** banner whenever demo data is loaded.

Test accounts (password for all: `Password123!`). Sign in with either the username or the email:

| Role | Username | Email |
|---|---|---|
| System Administrator | `admin` | `admin@crm.local` |
| Approver / Director | `director` | `director@crm.local` |
| Finance Officer | `finance` | `finance@crm.local` |
| Sales Manager (Enterprise team) | `manager` | `manager@crm.local` |
| Sales Manager (SMB team) | `manager2` | `manager2@crm.local` |
| Salesperson (Enterprise team) | `sales`, `sales2` | `sales@crm.local`, `sales2@crm.local` |
| Salesperson (SMB team) | `sales3`, `sales4` | `sales3@crm.local`, `sales4@crm.local` |
| Deactivated user (cannot sign in) | `inactive` | `inactive@crm.local` |

The login page does not display these accounts; share them from this document only.

To load only reference data (roles, permissions, settings and approval rules) without demo data, as in production, run `seedBase()` from `server/prisma/seed-base.ts`. It is idempotent and does not overwrite role permissions an administrator has changed.

## 5. Run

```bash
npm run dev:server     # API on http://localhost:4000
npm run dev:client     # UI on  http://localhost:5180 (proxies /api to the API)
```

Open **http://localhost:5180**. The Vite proxy keeps the API same-origin, so the session cookie stays first-party.

Production build:

```bash
npm run build                          # builds server/dist and client/dist
NODE_ENV=production npm start --prefix server
```

Serve `client/dist` from the same origin as `/api`, for example a reverse proxy routing `/api` to the Node process, and run behind HTTPS.

## 6. Tests

```bash
npm test                              # server, then client
npm test --prefix server              # 71 tests: unit + API integration
npm test --prefix client              # UI unit tests
```

Server integration tests run the real Express app against **`sales_crm_test`**, configured in `server/.env.test`. Migrations are applied automatically, every suite truncates and re-seeds reference data, and the runner refuses any database whose name lacks `_test`.

What's covered:
- **Authentication:** sign-in by email or username, generic login errors, unique usernames, HttpOnly/SameSite cookie, hashed session tokens, logout, deactivation revoking sessions, CSRF origin rejection.
- **Endpoint RBAC:** a matrix of role × endpoint denials, including that the administrator has no approval authority.
- **Data scoping:** salespeople see only their own records, managers only their team's, directors read everything but can't write; mass-assignment and strict-schema rejection.
- **Approval workflow:** routing by amount, reject (reason required), revise, resubmit, approve, conflict on double decision, read-only after approval, controlled revision, director pool for high values, a manager's own quote never routed to themself, the self-approval policy toggle, withdrawal, finance can't touch quotations, no-rule refusal, audit entries.
- **Finance:** invoicing only approved or accepted quotes and never twice, credit warn and block modes, due dates from terms, overpayment refused, partial, paid and void transitions, no future-dated payments, directors read-only, derived overdue status with deduplicated notifications, credit exposure.
- **Privilege escalation:** no self role or status change, no editing a role you hold, unknown permission codes rejected, last role manager protected, permission changes live on the next request, managers can't target themselves or other teams, settings and approval-rule validation.

## 7. Project structure

```
server/
  src/shared/         Permission catalogue, default role matrix, enums, settings catalogue. The client imports it as `@shared`
  prisma/             schema/ (one .prisma file per domain), migrations, seed-base.ts, seed.ts
  prisma.config.ts    Prisma CLI config: schema folder, migrations path, seed command
  src/config/         Environment validation
  src/lib/            prisma, errors, auth context & scoping, sessions, audit, notifications, money, settings
  src/middleware/     authenticate / requirePermission, origin check, rate limits, error handler
  src/modules/        One folder per module: routes + service + schemas
  src/jobs/           Overdue-invoice scanner
  test/               unit/, integration/, helpers
client/
  src/lib/            fetch wrapper, formatting, form helpers, response types
  src/auth/           AuthProvider (current user + permissions), route guards
  src/components/     ui/ design system, layout/ shell and navigation, charts/
  src/features/       Pages per module (dashboard, leads, quotations, approvals, invoices, admin, …)
docs/                 ARCHITECTURE.md, API.md
```

## Languages (English / မြန်မာ)

The interface supports English and Myanmar (Burmese, Unicode). Users switch with the **EN / မြန်မာ** toggle in the top bar or on the sign-in page; the choice is remembered in that browser.

- Translations live in `client/src/i18n/my.ts`, keyed by the English text. Any text without an entry stays in English.
- Shared components (page titles, form labels, hints and errors, buttons, table headers, filters, dialogs, toasts, empty states, menus) translate automatically. Text built with values uses placeholders, e.g. `translate('{count} open invoices', { count })`.
- Status, stage, method and role names use `enum.<CODE>` keys; a test fails if a code has no Burmese name.
- Myanmar uses the Noto Sans Myanmar font, taller line spacing, Burmese month names and Western digits for amounts.
- Server error messages that appear in the dictionary are shown translated.
- Have new or changed Burmese wording reviewed by a native speaker before release.

## 8. Security notes

- Every protected endpoint declares its required permissions, and services additionally constrain every query by data scope (own, team or all), so out-of-scope records return **404**.
- Request bodies are parsed with strict Zod schemas. Owners, statuses and totals are never accepted from clients.
- Passwords use Argon2id (OWASP parameters). Session tokens are 256-bit random values, and only their SHA-256 hash is stored.
- Cookies are `HttpOnly` and `SameSite=Lax`; in production they are `Secure` with the `__Host-` prefix. State-changing requests from foreign origins are rejected.
- Rate limits: login is limited to 10 failures per 15 minutes per IP + email (IPv6-safe), there is a sensitive-action limiter, and a global API limiter.
- `helmet` security headers, a 200 KB JSON body limit, and no stack traces in production error responses.
- Multi-step operations run in database transactions with row locks (`SELECT … FOR UPDATE`) for approvals, payments and invoicing, and the audit record commits in the same transaction.
- CSV exports neutralize spreadsheet formula injection.
- `npm audit` currently reports advisories only in dev tooling (Vitest's `tinypool`, the Prisma CLI's config loader). These do not ship in the production runtime and should be resolved by upgrading those tools.

## 9. Known limitations and next steps

- Approval is single-step: one approver per request, chosen by rule. Multi-level chains would extend `ApprovalRule` with a sequence.
- There are no PDF quotations or invoices and no email delivery. Notifications are in-app only.
- Overpayments, credit notes and multi-currency conversion are out of scope. A single company currency is configurable.
- The overdue scanner runs in-process. For multi-instance deployments, move it to a scheduled job.
