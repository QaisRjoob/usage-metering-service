# Usage Metering & Quota Service

A service that other applications call to **track usage and decide whether their users may perform
an action**. Every request is checked against two plans at once: the calling application's
**account plan** (a shared allowance) and the acting **user's plan** (an individual allowance). The
service records every decision, explains rejections (which rule, account or user level), keeps
history for any month, and stays correct under retries and concurrent requests.

It ships with an operator dashboard and an example client (the **Client Demo** page, plus a CLI).

> **New here?** [docs/USER_GUIDE.md](docs/USER_GUIDE.md) explains the app in plain words and walks
> through every page of the web interface step by step.

- **Two independent parts:** [`backend/`](backend) (Fastify + PostgreSQL API) and [`frontend/`](frontend)
  (React + Vite dashboard and Client Demo). Each has its own `package.json`, lockfile, Dockerfile and
  tests; the root only holds `docker-compose.yml` and the docs.
- **Architecture:** modular monolith, Clean Architecture layers, CQRS-lite, repositories, constructor DI.
- **One metered resource:** units (for example document-processing credits).

---

## Contents

1. [Quick start (Docker Compose)](#1-quick-start-docker-compose)
2. [Using the example client](#2-using-the-example-client)
3. [Account and user model](#3-account-and-user-model)
4. [API keys and the operator token](#4-api-keys-and-the-operator-token)
5. [API reference and curl walkthrough](#5-api-reference-and-curl-walkthrough)
6. [Supported rules and evaluation order](#6-supported-rules-and-evaluation-order)
7. [Predefined plans](#7-predefined-plans)
8. [Plan changes](#8-plan-changes)
9. [Retry behaviour and idempotency](#9-retry-behaviour-and-idempotency)
10. [Concurrency strategy](#10-concurrency-strategy)
11. [Product assumptions](#11-product-assumptions)
12. [Design decisions and trade-offs](#12-design-decisions-and-trade-offs)
13. [Testing](#13-testing)
14. [Performance](#14-performance)
15. [AI Usage Advisor](#15-ai-usage-advisor)
16. [Local development without Docker](#16-local-development-without-docker)
17. [Known limitations](#17-known-limitations)

---

## 1. Quick start (Docker Compose)

Requirements: Docker with Compose v2. No OpenAI key is needed.

```bash
docker compose up --build
```

| What | URL |
|---|---|
| Web dashboard + Client Demo | http://localhost:8080 |
| API | http://localhost:3000/api/v1 |
| API docs (Swagger UI) / OpenAPI JSON | http://localhost:3000/docs · http://localhost:3000/api/v1/openapi.json |
| PostgreSQL (for inspection) | `localhost:5433`, user/password/db `metering` |

Startup is automatic: PostgreSQL becomes healthy → the API applies SQL migrations, seeds the
predefined plans and the demo data (all idempotent) → the web app starts once the API is ready.

**Local demo credentials** (public, for local use only):

| Credential | Value | Used for |
|---|---|---|
| Operator admin token | `local-admin-token-change-me` (override with `ADMIN_API_TOKEN`) | the **operator console** (`/admin`) |
| Demo account API key | `umk_demo_local_only_do_not_use_in_production` | the **account portal** (`/app`) of "Demo Docs Inc" |

The web app opens on a **login page with one field**: paste any token and press *Sign in*. The server
identifies it (`POST /api/v1/auth/identify`): the operator token opens the operator console, an account
API key opens that account's portal — nobody picks a role by hand. Each role
gets its own interface (own layout, menu and URL space); the other role's pages are unreachable:

| Interface | URL | Pages |
|---|---|---|
| Operator console | `/admin` | Overview (dashboard), Accounts (category tabs with counts, search by name / id / key prefix / user id), account details (read-only), Users directory (end users of every company), Plan catalogue, Usage history across accounts, AI Advisor (all accounts); a header finder jumps to any company or user |
| Account portal | `/app` | Overview, Users, Plans, Quotas, Usage history, Client Demo, AI Advisor (own data) |

Only one role is signed in at a time (signing in as one signs you out of the other), and the API
enforces the same split independently: the admin token does not open account endpoints and an API
key does not open `/admin`. Credentials stay in the browser tab only (sessionStorage).

Start again from a clean state with `docker compose down -v && docker compose up --build`.

**Verified on 2026-10-15** (Docker Desktop 29.8.2, Compose v5.6, Windows 11 + WSL 2): from a clean
state the images built (web 75 MB, API 333 MB), startup ran postgres → API (migration applied, seed
done) → web with all three containers healthy, and the full Client Demo scenario above passed in the
browser at :8080. After `docker compose down` and `docker compose up` (volume kept), usage totals,
plan assignments, history and idempotent replay of an earlier `requestId` were all preserved, and the
migration check applied nothing new.

## 2. Using the example client

A click-by-click tour of all pages is in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### Client Demo page (http://localhost:8080/app/demo)

A simulated **document processor** — an external application — that calls the service with the demo
account's API key. It knows nothing about plans; before "processing" a document it calls
`POST /usage/consume` with a fresh `requestId`, then shows the decision and both remaining
allowances.

Seeded demo account **Demo Docs Inc**: custom account plan **Demo Shared Pool** (100 units/month,
100 per request); users `alice` (Basic: 1,000/month, 20/request), `bob` (Premium: 10,000/month,
200/request), `carol` (Basic).

Run the guided steps in order (each has a **Run** button):

| Step | Request | Result |
|---|---|---|
| 1 | alice, 10 units | **Accepted**: +10 for alice and +10 for the account |
| 2 | alice, 25 units | **Rejected** by `MAX_UNITS_PER_REQUEST`, **user** level (Basic allows 20) |
| 3 | bob, 95 units | **Rejected** by `MONTHLY_ALLOWANCE`, **account** level (90 shared units left; bob has 10,000) |
| 4 | Switch alice to Premium (or raise the shared pool) in the plan panel, then repeat step 2 or 3 | Now **accepted** — same client code, different outcome |
| 5 | "Retry same request" | Same `requestId` → the stored decision is **replayed**, nothing is consumed twice |

The plan panel on the same page uses the account's own configuration endpoints, standing in for
"another tab" of the account's admin tools; the client panel never changes.

### CLI client

```bash
cd backend
npm install
npm run demo:cli                       # the same scenario from the terminal
npm run demo:cli -- process alice 10   # a single request
```

`API_URL` (default `http://localhost:3000/api/v1`) and `API_KEY` (default the demo key) are
configurable. Run the scenario on a fresh demo account (it expects the 100-unit pool to be unused).

## 3. Account and user model

| Concept | Meaning |
|---|---|
| **Account** | A calling application. One API key. Its **account plan** defines limits shared by all its users. |
| **User** | A user of that application, registered under one account, identified by the application's own `externalUserId`. Its **user plan** defines individual limits. |
| **Plan** | Named rules (monthly allowance + max units per request) with a **scope**: `account` or `user`. Predefined (seeded, read-only) or custom (owned by one account). |
| **Units** | Positive whole numbers consumed by an action. |

Both plans apply to every request. The account's usage is the **sum of accepted usage across its
users**. Giving a user a larger plan does **not** increase the account's shared allowance. Users who
share a plan definition keep separate totals.

## 4. API keys and the operator token

- **Account API key** — sent as `X-API-Key: <key>` on every account-scoped request.
  - Issued once by `POST /api/v1/admin/accounts`; the response contains the raw key, which is never
    shown again. Format `umk_live_` + 32 random bytes (base64url).
  - Only a SHA-256 hash and a non-secret 13-character prefix are stored.
  - The key alone identifies the account; the API never accepts an account id instead.
  - Missing key → `401 API_KEY_MISSING`; unknown/malformed key → `401 API_KEY_INVALID`.
  - Resources of another account (users, plans, records) answer **404**, never 403.
- **Operator token** — `Authorization: Bearer <ADMIN_API_TOKEN>` for `/api/v1/admin/*` (create and
  list accounts, cross-account history, dashboard analytics). Compared in constant time. This is a
  **local/demo mechanism**: in production it would sit behind real operator authentication (out of
  scope). The operator token does not open account-scoped endpoints: registering users or changing
  plans always uses the account's own key, in the account portal. The operator's account pages are read-only.

## 5. API reference and curl walkthrough

The full contract is in [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) and the live OpenAPI document
at `/api/v1/openapi.json` (Swagger UI: `/docs`). The contract types and request schemas live in
[`backend/src/contracts`](backend/src/contracts), with an identical copy in
[`frontend/src/contracts`](frontend/src/contracts) (see §12).

| Area | Endpoints (prefix `/api/v1`) |
|---|---|
| Health | `GET /health`, `GET /ready` (checks PostgreSQL) |
| Operator | `POST/GET /admin/accounts`, `GET /admin/accounts/facets`, `GET /admin/accounts/:id`, `GET /admin/accounts/:id/users`, `GET /admin/users`, `GET /admin/users/facets`, `GET /admin/search`, `GET /admin/plans`, `GET /admin/usage`, `GET /admin/analytics/summary` |
| Account | `GET /account`, `PUT /account/plan`, `GET /account/usage-summary?month=YYYY-MM` |
| Users | `GET/POST /users`, `GET /users/:userId`, `PUT /users/:userId/plan`, `GET /users/:userId/usage-summary` |
| Plans | `GET/POST /plans`, `GET/PATCH /plans/:planId` |
| Quotas | `GET /quotas`, `POST /quotas/check` (dry run) |
| Usage | `POST /usage/consume`, `GET /usage`, `GET /usage/:usageId` |
| AI | `POST /ai/advisor` |

Errors always look like `{"error": {"code", "message", "requestId", "details?"}}`. Lists are
paginated: `?page=1&pageSize=20` (max 100) →
`{items, page, pageSize, totalItems, totalPages, hasNextPage, hasPreviousPage}`.

### Filtering and sorting (query DTOs)

Every list takes a **query DTO**: a zod schema in [`backend/src/contracts`](backend/src/contracts)
that validates and types the query string (`page`, `pageSize`, filters, `sort`, `order`). Filters
are applied in SQL, sort keys come from a whitelist (never raw SQL), every ordering has a unique
tie-breaker, and ranges are checked (`max ≥ min`, `to ≥ from`). Invalid input → `400 VALIDATION_ERROR`
naming the field. The web app validates with the **same schema** before requesting, so mistakes show
next to the field.

| List | Filters | Sort keys |
|---|---|---|
| `GET /admin/accounts` | `search` (name, account id, API key prefix, or a user's id / display name), `status`, `activity` (active/inactive this month), `hasRejections`, `planId`, `planKind` (predefined/custom), `minUsers`/`maxUsers`, `minUtilization`/`maxUtilization`, `createdFrom`/`createdTo`, `month` | `name`, `createdAt`, `utilization`, `consumed`, `userCount`, `lastActivity`, `rejected` |
| `GET /admin/users` (every company) | `search` (user id, display name, internal id), `accountId`, `planId`, `status`, `activity`, `minUtilization`/`maxUtilization`, `createdFrom`/`createdTo`, `month` | `externalUserId`, `accountName`, `createdAt`, `utilization`, `consumed`, `lastActivity` (default), `rejected` |
| `GET /users`, `GET /admin/accounts/:id/users`, `GET /quotas` | `search`, `status`, `planId`, `minUtilization`/`maxUtilization`, `month` (not on quotas) | `externalUserId`, `createdAt`, `utilization`, `consumed` |
| `GET /usage`, `GET /admin/usage` | `userId`, `outcome`, `rule`, `level`, `minUnits`/`maxUnits`, `requestId` (contains), `replayed`, `month`, `from`/`to`; admin adds `accountId` | `createdAt`, `units` |
| `GET /plans`, `GET /admin/plans` | `search`, `scope`, `kind`; admin adds `ownerAccountId` | `name`, `createdAt`, `monthlyAllowance`, `maxUnitsPerRequest` |

Example: the 20 largest rejections caused by a user limit this month, for one account:
`GET /api/v1/admin/usage?accountId=…&level=user&month=2026-10&sort=units&order=desc&pageSize=20`.

Category counts for the tabs come from `GET /admin/accounts/facets` and `GET /admin/users/facets`
(per status, plan and activity, within the current search), and the operator header finder uses
`GET /admin/search?q=` (up to 6 companies and 6 users, exact id / key-prefix matches first).
Sorting by `lastActivity` puts rows without any request last in both directions.

### Main flow with curl

```bash
API=http://localhost:3000/api/v1
ADMIN=local-admin-token-change-me

# 1. Operator creates an account (starts on Starter). Copy the apiKey from the response - it is shown once.
curl -s -X POST $API/admin/accounts -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"name":"Acme Docs"}'
KEY=umk_live_...   # paste the key

# 2. The application registers users (default plan Basic; Premium has a fixed id)
curl -s -X POST $API/users -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"externalUserId":"alice"}'
curl -s -X POST $API/users -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"externalUserId":"bob","planId":"00000000-0000-4000-8000-000000000004"}'

# 3. Consume: accepted (200, "accepted": true, remaining for account and user)
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"alice","units":10,"requestId":"doc-1001"}'

# 4. Rejection: 25 > Basic's 20 per request (200, "accepted": false, rule + level)
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"alice","units":25,"requestId":"doc-1002"}'

# 5. Retry of doc-1001: replayed, nothing consumed again ("idempotentReplay": true)
curl -si -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"alice","units":10,"requestId":"doc-1001"}'

# 6. Plan change: a small custom shared plan, assigned to the account
PLAN=$(curl -s -X POST $API/plans -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Tiny pool","scope":"account","monthlyAllowance":50,"maxUnitsPerRequest":100}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X PUT $API/account/plan -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d "{\"planId\":\"$PLAN\"}"
# bob (Premium) asks for 45: only 40 shared units remain -> rejected at the ACCOUNT level
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"bob","units":45,"requestId":"doc-1003"}'
# raise the plan (creates version 2) and try again with a new requestId -> accepted
curl -s -X PATCH $API/plans/$PLAN -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"monthlyAllowance":500}'
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"bob","units":45,"requestId":"doc-1004"}'

# 7. History (accepted and rejected), any month, filters: userId, outcome, month, from, to
curl -s "$API/usage?pageSize=10&outcome=rejected" -H "X-API-Key: $KEY"
curl -s "$API/account/usage-summary?month=2026-10" -H "X-API-Key: $KEY"

# Dry run (never consumes or records)
curl -s -X POST $API/quotas/check -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"userId":"alice","units":5}'
```

## 6. Supported rules and evaluation order

Two rule types, on **both** the account plan and the user plan:

| Rule | Meaning |
|---|---|
| `MONTHLY_ALLOWANCE` | Total units per **UTC calendar month**. |
| `MAX_UNITS_PER_REQUEST` | Largest amount a single request may consume. |

A request is accepted only if all four checks pass. They run in a fixed order and the **first
failure** is reported as `rejection` (all failures are listed in `violations`):

1. user `MAX_UNITS_PER_REQUEST`
2. account `MAX_UNITS_PER_REQUEST`
3. user `MONTHLY_ALLOWANCE`
4. account `MONTHLY_ALLOWANCE`

Per-request rules come first because they are independent of current usage (a retry next month
would fail the same way); the user level comes before the account level because it is the more
specific limit. A rejection consumes nothing — there is no partial consumption. An accepted
request adds the units to the user's and the account's counters for the month in which it was
processed. The pure evaluation lives in
[`Domain/Quotas/QuotaPolicy.ts`](backend/src/Domain/Quotas/QuotaPolicy.ts). No extra rule types
were added.

`remaining = max(0, allowance − consumed)`; `utilizationPercent` is the real ratio and can exceed
100 % after a reduction. Status: `ok` (< 80 %), `warning` (≥ 80 %), `exhausted` (0 remaining),
`over_allowance` (consumed > allowance).

## 7. Predefined plans

Seeded at every startup with fixed ids (idempotent, never overwritten); read-only.

| Plan | Scope | Monthly allowance | Max per request | id |
|---|---|---|---|---|
| Starter | account | 10,000 | 100 | `00000000-0000-4000-8000-000000000001` |
| Pro | account | 100,000 | 500 | `00000000-0000-4000-8000-000000000002` |
| Basic | user | 1,000 | 20 | `00000000-0000-4000-8000-000000000003` |
| Premium | user | 10,000 | 200 | `00000000-0000-4000-8000-000000000004` |

New accounts start on **Starter** and new users on **Basic** unless another plan is given.

## 8. Plan changes

- Plans live in the database, so changes take effect **without redeploying**.
- `PATCH /plans/:id` on a custom plan: a change to a limit inserts a new **immutable version** and points
  the plan at it (renames do not create versions). Every account/user on that plan uses the new
  limits from the next request.
- Assigning a plan (`PUT /account/plan`, `PUT /users/:id/plan`) **keeps units already consumed**
  this month — counters belong to the account/user and month, not to the plan.
- Reducing an allowance below current usage shows **0 remaining** (`over_allowance`) and rejects
  that level until the allowance is raised or a new month starts.
- History is never rewritten: each record stores the account plan version and user plan version that
  decided it.
- Predefined plans → `403 PLAN_READ_ONLY`; a user plan on an account (or vice versa) →
  `422 PLAN_SCOPE_MISMATCH` (also enforced by a composite foreign key in the database); another
  account's custom plan → `404`.

## 9. Retry behaviour and idempotency

- `requestId` (in the consume body) is the idempotency key, scoped to the account:
  `UNIQUE (account_id, request_id)`. The fingerprint is `(userId, units)`.
- **Same key, same payload** → the stored decision is returned again, accepted **or rejected**, with
  `"idempotentReplay": true` and header `Idempotent-Replayed: true`. Nothing is consumed again; the
  response shows the counters as they were right after the original decision.
- **Same key, different payload** → `409 IDEMPOTENCY_KEY_REUSED`.
- Because rejections are stored and replayed too, retrying a rejected request with the same key gives
  the same rejection. To re-evaluate (e.g. after a plan change), send a **new** `requestId`.
- Concurrent duplicates: the second request waits for the first to commit, then replays it (tested
  with 30 simultaneous copies → one record, one consumption).
- Safe to retry after timeouts or network errors: the decision and the idempotency record are
  written in the same transaction, so they can never disagree.

## 10. Concurrency strategy

Consumption is never "read, check in memory, write". The whole decision is one PostgreSQL
transaction ([`ConsumeUnitsCommand`](backend/src/Application/Modules/Usage/Commands/ConsumeUnitsCommand.ts)):

1. `pg_advisory_xact_lock(hash(account, requestId))` — concurrent copies of one request queue here.
2. Look up the request id → replay or 409.
3. `SELECT … FOR UPDATE` the **account** counter row for the month, then the **user** counter row
   (created with `INSERT … ON CONFLICT DO NOTHING` on the first request of a month). The fixed order —
   account, then user — prevents deadlocks.
4. Read both current plan versions **after** the locks, so a plan change committed before is seen.
5. Evaluate (pure domain function).
6. If accepted, increment both counters in one statement.
7. Insert the usage record (accepted or rejected).
8. Commit. Any error rolls everything back. Deadlock/serialization errors (not expected given the lock
   order) are retried up to 3 times, re-running the whole unit.

Correctness comes from the row locks, so the default READ COMMITTED isolation is enough. Nothing relies
on in-process mutexes; several API instances can share the database. The concurrency tests fire up
to 150 simultaneous requests and then verify **counters = sum of accepted records** at both levels
and that no limit was exceeded, including while the plan is being changed concurrently.

## 11. Product assumptions

| # | Assumption | Reasoning |
|---|---|---|
| 1 | Units are integers 1 – 1,000,000 per request; counters are BIGINT. | No floating point; an upper bound rejects absurd input early. |
| 2 | The period is the **UTC** month of the server's processing time. | The brief says usage belongs to the month in which it is processed; clients' clocks are not trusted. |
| 3 | Rule order as in §6; the first failure is reported, all are listed. | Deterministic, explains the most specific cause first. |
| 4 | A quota rejection is `200` with `accepted: false`; validation is `400`, auth `401`. | A rejection is a valid business answer, not a client error; clients branch on `accepted`. |
| 5 | Rejected decisions are stored and replayed. | History shows rejections; a retry gets a stable answer. Re-evaluation needs a new request id. |
| 6 | Callers identify users by their own `externalUserId` (unique per account). | Clients do not need to store our ids. The same id can exist in different accounts. |
| 7 | Consuming for an unknown user is `404 USER_NOT_FOUND` and is not recorded. | It is not a quota decision; users are registered explicitly (no implicit creation). |
| 8 | New accounts default to Starter, new users to Basic; operator-created accounts may only start on a predefined plan. | Custom plans belong to an account, which does not exist yet at creation. |
| 9 | Custom plan names are unique per account (case-insensitive). | Avoids confusing duplicates in the UI. |
| 10 | Utilization ≥ 80 % = "approaching the limit"; an allowance of 0 counts as 100 %. | Simple, documented threshold used everywhere. |
| 11 | Dry runs (`/quotas/check`) are advisory and never recorded. | They change nothing; consume re-checks atomically. |
| 12 | Quota views for a past month compare that month's consumption with the plan's **current** limits. | Counters per month are exact; each record keeps the exact plan version that decided it. |
| 13 | The operator token is a single static secret. | The brief excludes end-user login/RBAC; documented as local/demo only. |

## 12. Design decisions and trade-offs

**Architecture.** One deployable API and one PostgreSQL database (modular monolith).

```text
docker-compose.yml   full stack (postgres + backend + frontend)
docs/                API contract
backend/             the API - own package.json, lockfile, Dockerfile
  src/
    Domain/          pure business rules: QuotaPolicy (two-level evaluation), periods, plan rules, API key value object
    Application/     use cases (Commands = writes, Queries = reads), repository interfaces, DTO mapping
    Infrastructure/  PostgreSQL (pool, migrations, seed, transaction manager, repositories), AI providers
    Presentation/    Fastify routes, error envelope, OpenAPI
    Shared/          AppError + status mapping, auth/request-id middleware, validation
    contracts/       DTO types, zod request schemas, error codes, pagination (the API contract)
    container.ts     composition root (constructor injection, the only place that knows concrete classes)
  tests/             unit, integration, concurrency, performance
  scripts/           CLI example client
frontend/            the web app - own package.json, lockfile, Dockerfile
  src/               models, services (HTTP + mock behind one interface), view_models (hooks), views, widgets
    contracts/       copy of backend/src/contracts, imported as '@/contracts'
```

**Two independent parts.** `backend/` and `frontend/` share no build tooling and can be installed,
tested, built and deployed separately. The price is that the contract files exist twice: when the
API contract changes, update `backend/src/contracts` and copy the same change to
`frontend/src/contracts` (the files are identical; `diff -r backend/src/contracts frontend/src/contracts`
must print nothing).

Tracing a consume request: `Presentation/Routes/usage.routes.ts` → `ConsumeUnitsCommand.execute` →
`Domain/Quotas/QuotaPolicy.evaluateRequest` → SQL in `PostgresQuotaRepository` /
`PostgresUsageRepository`, all inside `PostgresTransactionManager.run`.

**Schema** ([migration](backend/src/Infrastructure/Database/migrations/001_initial_schema.sql)):
`plans` + immutable `plan_versions`; `accounts` (key hash, prefix, plan) and `users` (unique
`(account_id, external_user_id)`); monthly counters `account_usage_counters (account_id, period)` and
`user_usage_counters (user_id, period)`; `usage_records` (every decision, also the idempotency record).
Check constraints guard units, allowances, outcomes and period dates; composite foreign keys enforce
plan scope; indexes serve history pages `(account_id, created_at DESC, id DESC)` and friends. A new
month needs no job: it simply uses new counter rows.

**Counters vs. summing records.** Decisions read a counter row instead of summing history: O(1) and
lockable. The record table stays the audit trail; tests and the load test verify they agree.

**Plain SQL with `pg`.** Explicit, reviewable queries; the concurrency-critical SQL is not hidden
behind an ORM.

**Auth.** API keys (required by the brief) hashed with SHA-256 (fine for 256-bit random keys and
allows indexed lookup). No JWT/end-user login (out of scope).

**Frontend.** React + TanStack Query (server state, short `staleTime` for quotas, invalidation after
every mutation), URL search params for filters/sort/pagination (one `useListQuery` hook validating with the shared query DTO), a single-field login page (the server identifies the token) leading to two role-guarded interfaces (`/admin`, `/app`), reusable filter bars (quick filters, "More filters" panel, removable chips, sortable column headers), lazy-loaded pages, a mock adapter that
follows the same business rules (Phase 1) and the HTTP adapter behind the same interfaces. The mock is
never active in a production build unless explicitly configured.

**Conflicts between the engineering spec and the brief** (the brief wins): API keys instead of JWT;
an admin token for the operator dashboard; Compose runs the full stack; two-level quotas everywhere;
a Client Demo page added; AI kept as an extension that respects account isolation.

## 13. Testing

Run `npm install` once in each folder first.

| Suite | Command | Needs |
|---|---|---|
| Frontend (Vitest + Testing Library) | `cd frontend && npm test` | nothing |
| Backend unit (domain, validation, AI validation) | `cd backend && npm test` | nothing |
| Backend integration (HTTP via `app.inject` + real PostgreSQL) | `cd backend && npm run test:integration` | PostgreSQL |
| Backend concurrency | `cd backend && npm run test:concurrency` | PostgreSQL |
| Typecheck / lint / build | `npm run typecheck` · `npm run lint` · `npm run build` (in either folder) | nothing |

DB tests **recreate** the database named in `TEST_DATABASE_URL` (default
`postgres://postgres:postgres@localhost:5432/metering_test`; the name must contain "test"). With
Compose: `TEST_DATABASE_URL=postgres://metering:metering@localhost:5433/metering_test`.

Covered: the three worked examples from the brief (unit and end to end), rule order, boundaries,
API key validation (missing / invalid / valid, hash-only storage), admin token, **account isolation**
(users, plans, records, history, consumption → 404), idempotent replay (accepted and rejected), 409 on
key reuse, dry run, validation errors, plan versions, scope mismatch, read-only predefined plans,
switching plans, reductions below usage, UTC month rollover with an injectable clock, pagination and
filters, migrations/seed idempotency, transaction rollback, AI scope and provider failures, and the
concurrency cases in §10. Web tests include the full Client Demo scenario against the mock adapter.

## 14. Performance

Method, commands, dependencies and full results: [backend/tests/performance/RESULTS.md](backend/tests/performance/RESULTS.md).
Summary (laptop, API + PostgreSQL + load generator on one machine, 50 connections):

| Scenario | Before | After |
|---|---|---|
| hot: 1 account, 200 users (one counter row) | 365 req/s, p90 249 ms | 395 req/s, p90 137 ms |
| spread: 50 accounts × 20 users | 798 req/s | 935 req/s |
| history pages | 289 req/s, p50 162 ms | 678 req/s, p50 75 ms |
| limit: 4,000 × 10 units vs 20,000 allowance | exactly 2,000 accepted | exactly 2,000 accepted |

After every run: counters = sum of accepted records, no counter over its allowance. Learnings: joining
before paginating made history slow (fixed by paging first); the hot account's row lock is the
intended bottleneck, so the fix was fewer round trips while holding it; durability was not traded
for speed (`synchronous_commit` stays on).

## 15. AI Usage Advisor

`POST /api/v1/ai/advisor` (page **AI Advisor**). The service computes the numbers (account/user
quotas, rejections by rule, top accounts/users, daily volume, "unusual" days = more than twice the
average) and the provider only explains them, returning a validated JSON structure.

| Variable | Default | |
|---|---|---|
| `AI_PROVIDER` | `mock` | `mock` (deterministic, labelled as mock) or `openai` |
| `OPENAI_API_KEY` | – | required for `openai`; server-side only, never sent to the browser |
| `OPENAI_MODEL` | – | required for `openai`; verified with the API at startup (warning if unknown) |
| `OPENAI_TIMEOUT_MS` / `AI_MAX_OUTPUT_TOKENS` | 20000 / 800 | |
| `AI_RATE_LIMIT_PER_WINDOW` / `AI_RATE_LIMIT_WINDOW_MS` | 10 / 60000 | per credential |

With an API key the advisor sees only that account; with the operator token it sees cross-account
aggregates. The model cannot query the database or change anything. Prompts keep system
instructions separate from the question and data, treat names as untrusted data, and cap their size;
questions are not logged. The OpenAI provider uses the official SDK (Responses API, strict JSON
schema). It was implemented against the SDK but **not exercised against the live OpenAI API** in this
environment (no key available); tests use the mock and a failing test double.

To try OpenAI with Compose: create `.env` next to `docker-compose.yml` with `AI_PROVIDER=openai`,
`OPENAI_API_KEY=...`, `OPENAI_MODEL=<a model your key can use>`.

## 16. Local development without Docker

Requirements: Node.js 22+ and PostgreSQL 15+.

Backend (terminal 1):

```bash
cd backend
npm install
cp .env.example .env          # set DATABASE_URL and ADMIN_API_TOKEN
npm run dev                   # http://localhost:3000 (migrates + seeds on start)
```

Frontend (terminal 2):

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 with the in-browser mock adapter (no backend needed)
npm run dev:api-mode          # http://localhost:5174 against the real API on :3000
```

`npm run db:migrate` / `npm run db:seed` (in `backend/`) run the startup steps manually.

## 17. Known limitations

- The operator token is a single static secret (local/demo); no key rotation endpoint yet (the
  key-lookup cache would need invalidating if rotation were added).
- Quota views for past months use the current plan limits (records keep the exact versions).
- One account's consumes serialize on its counter row (~400 decisions/s for a single account on
  the test laptop); many accounts scale independently. Sharded counters would be the next step.
- History totals use `count(*)`; for very large single-account months this costs ~90 ms (cursor
  pagination would avoid it).
- The OpenAI provider was not run against the live API here (no credentials).
- `npm audit` reports advisories only in dev tooling (vitest's `tinypool`); not part of any image.

---

Final Project of the Boot.dev Plan (TypeScript) – 2026-C3. Remember to submit the internship's
feedback form with the repository link.
