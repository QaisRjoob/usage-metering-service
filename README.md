<div align="center">

# Usage Metering & Quota Service

**Two-level usage metering and quota enforcement for multi-tenant applications**

Other applications call this service before a user performs a metered action. It checks the request
against the application's shared **account plan** and the acting **user's plan**, records the decision,
explains rejections, and stays correct under retries and concurrent traffic.

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)

[Quick start](#-quick-start) ·
[Architecture](#-architecture) ·
[API](#-api) ·
[Quota rules](#-quota-rules) ·
[UML diagrams](#-uml-diagrams) ·
[User guide](docs/USER_GUIDE.md)

</div>

---

## Table of contents

1. [Overview](#-overview)
2. [Features](#-features)
3. [Tech stack](#-tech-stack)
4. [Quick start](#-quick-start)
5. [Using the application](#-using-the-application)
6. [Architecture](#-architecture)
7. [Domain model](#-domain-model)
8. [Authentication and security](#-authentication-and-security)
9. [API](#-api)
10. [Quota rules](#-quota-rules)
11. [Plans and plan changes](#-plans-and-plan-changes)
12. [Idempotency and retries](#-idempotency-and-retries)
13. [Concurrency](#-concurrency)
14. [AI Usage Advisor](#-ai-usage-advisor)
15. [Testing](#-testing)
16. [Performance](#-performance)
17. [Local development](#-local-development)
18. [Product assumptions](#-product-assumptions)
19. [Design decisions and trade-offs](#-design-decisions-and-trade-offs)
20. [Known limitations](#-known-limitations)
21. [UML diagrams](#-uml-diagrams)
22. [Documentation](#-documentation)

---

## 📌 Overview

| Concept | Meaning |
|---|---|
| **Account** | A calling application (a company). It has one API key and an **account plan** whose limits are shared by all its users. |
| **User** | A user of that application, identified by the application's own `externalUserId`. Its **user plan** sets individual limits. |
| **Plan** | Named rules (monthly allowance + maximum units per request) with a scope: `account` or `user`. Predefined (read-only) or custom (owned by one account). |
| **Units** | Positive whole numbers consumed by an action, for example document-processing credits. |

Every request is evaluated against **both** plans. An account's usage is the sum of the accepted usage of
its users, so giving one user a bigger plan never enlarges the shared pool. A rejected request consumes
nothing.

The repository has two independent parts, each with its own `package.json`, lockfile, Dockerfile and
tests:

- [`backend/`](backend): the API (Fastify + PostgreSQL)
- [`frontend/`](frontend): the web app (React + Vite): operator console, company portal, Client Demo

---

## ✨ Features

**Metering core**
- Two-level quota decision (user plan **and** account plan) inside one PostgreSQL transaction
- Clear rejections: which rule (`MONTHLY_ALLOWANCE`, `MAX_UNITS_PER_REQUEST`) and which level (`user`, `account`)
- Idempotent retries through a client `requestId`; accepted and rejected decisions are replayed
- Correct under concurrency: row locks in a fixed order, verified with up to 150 simultaneous requests
- Versioned plans: changes take effect immediately, and history keeps the exact versions that decided each request
- Monthly (UTC) counters, with full history for any month

**Web application**
- **Operator console** (`/admin`): dashboard, access requests, companies with category tabs and search, company and user drill-down, company statistics, a directory of all users, plan catalogue, cross-account history, and a header finder
- **Company portal** (`/app`): overview, users, plans, quotas, usage history, user statistics, Client Demo
- **Self-service sign-up**: a company applies, the operator approves or denies, and the company collects its API key exactly once
- Light and dark theme, URL-driven filters, sorting and pagination
- Arabic sample data

**Security**
- JWT access tokens (15 min) with rotating refresh tokens in an `HttpOnly` cookie and reuse detection
- Role-separated interfaces and endpoints (`operator` / `account`); other tenants' data answers `404`
- API keys and refresh tokens stored only as SHA-256 hashes
- Rate limits, CSP and security headers, loopback-only ports

**Extras**
- AI Usage Advisor (mock, or OpenAI / any OpenAI-compatible API such as OpenRouter)
- OpenAPI document with Swagger UI
- CLI example client and a demo data generator

---

## 🧰 Tech stack

| Layer | Technologies |
|---|---|
| Backend | Node.js 22, TypeScript 5.9, Fastify 5, `pg` (plain SQL), zod 4, `jose` (JWT), OpenAI SDK |
| Database | PostgreSQL 17 (SQL migrations, constraints, composite foreign keys) |
| Frontend | React 19, Vite 7, React Router 7, TanStack Query 5, Tailwind CSS 4, Recharts |
| Testing | Vitest, Testing Library, integration tests against a real PostgreSQL |
| Delivery | Docker Compose (nginx, API, PostgreSQL) |
| Documentation | OpenAPI / Swagger UI, PlantUML |

---

## 🚀 Quick start

**Requirements:** Docker with Compose v2. No AI key is needed (the advisor falls back to a mock).

```bash
git clone https://github.com/QaisRjoob/usage-metering-service.git
cd usage-metering-service
docker compose up --build
```

| What | URL |
|---|---|
| Web app (operator console, company portal, Client Demo) | http://localhost:8080 |
| API | http://localhost:3000/api/v1 |
| Swagger UI / OpenAPI JSON | http://localhost:3000/docs · http://localhost:3000/api/v1/openapi.json |
| PostgreSQL (inspection) | `localhost:5433`, user / password / database `metering` |

Startup is automatic: PostgreSQL becomes healthy, then the API applies the migrations and seeds the
predefined plans and demo data (all idempotent), then the web app starts once the API is ready.

### Demo credentials (local use only)

| Credential | Value | Opens |
|---|---|---|
| Operator token | `local-admin-token-change-me` (set `ADMIN_API_TOKEN` to change it) | Operator console `/admin` |
| Demo account API key | `umk_demo_local_only_do_not_use_in_production` | Company portal `/app` of "شركة الوثائق التجريبية" |

The login page has a single field: paste a credential and the server identifies it, so nobody picks a
role by hand. To start again from a clean state:

```bash
docker compose down -v
```

Then run `docker compose up --build` again.

> The web app calls the API on its own origin (`/api/*` is proxied by nginx), so it works the same
> on `localhost`, `127.0.0.1` and `[::1]`. Ports are published on the loopback interface only, and
> containers restart automatically with Docker Desktop.

---

## 🖥️ Using the application

A click-by-click tour of every page is in **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)**.

| Interface | URL | Pages |
|---|---|---|
| Public | `/login`, `/signup`, `/signup/status` | Sign in; request access; follow a request and collect the API key |
| Operator console | `/admin` | Overview, Access requests, Accounts (tabs, search, company and user drill-down), Company statistics, Users directory, Plan catalogue, Usage history, AI Advisor |
| Company portal | `/app` | Overview, Users (and user details), Plans, Quotas, Usage history, Client Demo, AI Advisor |

Only one role is signed in at a time, and the API enforces the same split on its own.

### Client Demo (http://localhost:8080/app/demo)

A simulated **document processor**, an external application that knows nothing about plans. Before
"processing" a document it calls `POST /usage/consume` with a fresh `requestId` and shows the decision.

Seeded data: account **شركة الوثائق التجريبية** on the custom plan **الرصيد المشترك التجريبي**
(100 units/month, 100 per request), with users `ahmad` (أحمد الخطيب, Basic), `sara` (سارة النجار, Premium)
and `omar` (عمر حداد, Basic).

| Step | Request | Result |
|---|---|---|
| 1 | ahmad, 10 units | **Accepted**: +10 for ahmad and +10 for the account |
| 2 | ahmad, 25 units | **Rejected**: `MAX_UNITS_PER_REQUEST`, **user** level (Basic allows 20) |
| 3 | sara, 95 units | **Rejected**: `MONTHLY_ALLOWANCE`, **account** level (90 shared units left) |
| 4 | Switch ahmad to Premium or raise the pool, then repeat step 2 or 3 | **Accepted**: same client code, different outcome |
| 5 | "Retry same request" | Same `requestId`: the stored decision is **replayed**, nothing consumed twice |

### CLI client and sample data

```bash
cd backend
npm install
npm run demo:cli
```

`npm run demo:cli -- process ahmad 10` sends a single request (`API_URL` and `API_KEY` are configurable).
With the stack running, `npm run demo:populate` adds three more Arabic-named companies with users, custom
plans, accepted and rejected requests, and sign-up requests (run it once, on a fresh database).

---

## 🏗️ Architecture

A **modular monolith** following Clean Architecture with CQRS-lite (commands for writes, queries for
reads), repositories and constructor injection. `container.ts` is the only place that knows the
concrete classes.

<p align="center">
  <img src="docs/uml/svg/07-component-architecture.svg" alt="Component diagram" width="100%">
</p>

```text
docker-compose.yml   full stack: postgres + api + web
docs/                API contract, database, security, user guide, UML diagrams
backend/
  src/
    Domain/          pure business rules: QuotaPolicy (two-level evaluation), periods, plan rules
    Application/     use cases (Commands / Queries), ports (repository interfaces), DTO mapping
    Infrastructure/  PostgreSQL (pool, migrations, seed, transactions, repositories), JWT, AI providers
    Presentation/    Fastify routes, error envelope, OpenAPI
    Shared/          AppError, auth guards, rate limiting, validation
    contracts/       DTOs and zod schemas: the API contract
    container.ts     composition root
  tests/             unit, integration, concurrency, performance
  scripts/           CLI client and demo data
frontend/
  src/               models, services (HTTP + mock), view models (hooks), views, widgets
    contracts/       identical copy of backend/src/contracts
```

Tracing a consume request: `usage.routes.ts` → `ConsumeUnitsCommand` → `QuotaPolicy.evaluateRequest`
→ `PostgresQuotaRepository` / `PostgresUsageRepository`, all inside `PostgresTransactionManager.run`.

### Deployment

<p align="center">
  <img src="docs/uml/svg/08-deployment.svg" alt="Deployment diagram" width="85%">
</p>

---

## 🧩 Domain model

<p align="center">
  <img src="docs/uml/svg/06-class-domain.svg" alt="Class diagram" width="90%">
</p>

The schema (migrations 001 to 005) keeps `plans` with immutable `plan_versions`, `accounts`, `users`,
monthly counters per account and per user, and `usage_records` (every decision, which is also the
idempotency record). Check constraints, composite foreign keys (plan scope, user/account consistency)
and indexes for the history pages are described in [docs/DATABASE.md](docs/DATABASE.md).

<details>
<summary><b>ER diagram</b></summary>
<p align="center">
  <img src="docs/uml/svg/09-er-database.svg" alt="ER diagram" width="100%">
</p>
</details>

---

## 🔐 Authentication and security

Signing in exchanges a credential (an account API key or the operator token) for a **JWT**:
`POST /api/v1/auth/token` returns a short-lived access token and sets a refresh token cookie. Every
other browser request sends `Authorization: Bearer <access token>`.

| Token | What it is | Lifetime | Where it lives |
|---|---|---|---|
| Access token | JWT (HS256): `iss`, `aud`, `sub`, `role`, `iat`, `exp`, `jti` | 15 min (`ACCESS_TOKEN_TTL_SECONDS`) | Browser memory only |
| Refresh token | Opaque random value (`umr_…`), stored as a SHA-256 hash | 7 days (`REFRESH_TOKEN_TTL_DAYS`) | `HttpOnly`, `SameSite=Strict` cookie, path `/api/v1/auth` |

- **Rotation and reuse detection:** `POST /auth/refresh` uses up the refresh token and issues a new pair.
  Presenting a used token again revokes the whole session family. `POST /auth/logout` revokes the session.
  Both require `X-Requested-With: umk-web` (CSRF guard).
- **Silent refresh:** the web app refreshes 30 seconds before expiry, retries once on `TOKEN_EXPIRED`,
  and restores the session after a page reload from the cookie.
- **Strict verification:** the algorithm, issuer and audience are pinned, so `alg: none` or foreign keys
  give `401 TOKEN_INVALID`.
- **Roles:** `/admin/*` accepts only operator tokens and account endpoints only account tokens
  (`403 INSUFFICIENT_ROLE`). Another tenant's resources answer `404`, never `403`.
- **API keys** (`umk_live_` + 32 random bytes) are shown once; only a hash and a display prefix are
  stored. Server-to-server clients may send the key directly as `X-API-Key` on account endpoints.
- **Operator token** (`ADMIN_API_TOKEN`) is accepted only by `POST /auth/token`.
- Rate limits on sign-in failures, sign-up and the AI endpoint; Helmet and CSP headers; trusted proxy limited to the web container.

<p align="center">
  <img src="docs/uml/svg/03-sequence-jwt-auth.svg" alt="JWT sequence diagram" width="90%">
</p>

The full permission matrix and controls are in [docs/SECURITY.md](docs/SECURITY.md).

### Self-service sign-up

A company fills in `/signup` and receives a **request id** and a **claim code** (shown once, stored as a
hash). The operator approves (the account is created in the same transaction) or denies with a reason.
The company follows the request on `/signup/status` and collects its API key exactly once. There is one
open request per email, and submissions are rate-limited per IP (`SIGNUP_RATE_LIMIT_PER_MINUTE`).

<p align="center">
  <img src="docs/uml/svg/04-sequence-signup.svg" alt="Sign-up sequence diagram" width="90%">
</p>

---

## 📡 API

The full contract is in [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md), and the live OpenAPI document is
at `/api/v1/openapi.json` (Swagger UI at `/docs`).

| Area | Endpoints (prefix `/api/v1`) |
|---|---|
| Health | `GET /health`, `GET /ready` |
| Auth | `POST /auth/token`, `POST /auth/refresh`, `POST /auth/logout` |
| Sign-up | `POST /signup-requests`, `POST /signup-requests/status`, `POST /signup-requests/claim` |
| Operator | `POST/GET /admin/accounts`, `GET /admin/accounts/facets`, `GET /admin/accounts/:id`, `GET /admin/accounts/:id/users`, `GET /admin/accounts/:id/usage-summary`, `GET /admin/accounts/:id/users/:userId`, `GET /admin/analytics/companies`, `GET /admin/analytics/summary`, `GET /admin/users`, `GET /admin/users/facets`, `GET /admin/search`, `GET /admin/plans`, `GET /admin/usage`, `GET /admin/signup-requests`, `POST /admin/signup-requests/:requestId/approve`, `POST /admin/signup-requests/:requestId/reject` |
| Account | `GET /account`, `PUT /account/plan`, `GET /account/usage-summary?month=YYYY-MM` |
| Users | `GET/POST /users`, `GET /users/:userId`, `PUT /users/:userId/plan`, `GET /users/:userId/usage-summary` |
| Plans | `GET/POST /plans`, `GET/PATCH /plans/:planId` |
| Quotas | `GET /quotas`, `POST /quotas/check` (dry run) |
| Usage | `POST /usage/consume`, `GET /usage`, `GET /usage/:usageId` |
| AI | `POST /ai/advisor` |

**Conventions**
- **Errors:** `{"error": {"code", "message", "requestId", "details?"}}`.
- **Pagination:** `?page=1&pageSize=20` (max 100) returns `{items, page, pageSize, totalItems, totalPages, hasNextPage, hasPreviousPage}`.
- **List queries:** every list validates its query string with a zod DTO shared with the frontend. Filters
  run in SQL, sort keys come from a whitelist with a unique tie-breaker, and ranges are checked.

<details>
<summary><b>Filters and sort keys per list</b></summary>

| List | Filters | Sort keys |
|---|---|---|
| `GET /admin/accounts` | `search` (name, id, key prefix, user id / name), `status`, `activity`, `hasRejections`, `planId`, `planKind`, `minUsers`/`maxUsers`, `minUtilization`/`maxUtilization`, `createdFrom`/`createdTo`, `month` | `name`, `createdAt`, `utilization`, `consumed`, `userCount`, `lastActivity`, `rejected` |
| `GET /admin/users` | `search`, `accountId`, `planId`, `status`, `activity`, `minUtilization`/`maxUtilization`, `createdFrom`/`createdTo`, `month` | `externalUserId`, `accountName`, `createdAt`, `utilization`, `consumed`, `lastActivity`, `rejected` |
| `GET /users`, `GET /admin/accounts/:id/users`, `GET /quotas` | `search`, `status`, `planId`, `activity`, `hasRejections`, `minUtilization`/`maxUtilization`, `createdFrom`/`createdTo`, `month` | `externalUserId`, `createdAt`, `utilization`, `consumed`, `lastActivity`, `rejected` |
| `GET /usage`, `GET /admin/usage` | `userId`, `outcome`, `rule`, `level`, `minUnits`/`maxUnits`, `requestId`, `replayed`, `month`, `from`/`to` (admin adds `accountId`) | `createdAt`, `units` |
| `GET /plans`, `GET /admin/plans` | `search`, `scope`, `kind` (admin adds `ownerAccountId`) | `name`, `createdAt`, `monthlyAllowance`, `maxUnitsPerRequest` |

</details>

<details>
<summary><b>Walkthrough with curl</b></summary>

```bash
API=http://localhost:3000/api/v1

# 0. Operator signs in: the operator token is exchanged for a JWT (15 minutes)
curl -s -X POST $API/auth/token -H 'Content-Type: application/json' -d '{"token":"local-admin-token-change-me"}'
JWT=eyJ...   # paste accessToken

# 1. Create an account (starts on Starter); the apiKey is shown once
curl -s -X POST $API/admin/accounts -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' -d '{"name":"Acme Docs"}'
KEY=umk_live_...   # paste the key

# 2. Register users (default Basic; Premium has a fixed id)
curl -s -X POST $API/users -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"externalUserId":"ahmad"}'
curl -s -X POST $API/users -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"externalUserId":"sara","planId":"00000000-0000-4000-8000-000000000004"}'

# 3. Accepted
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"ahmad","units":10,"requestId":"doc-1001"}'

# 4. Rejected: 25 > Basic's 20 per request (rule + level in the response)
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"ahmad","units":25,"requestId":"doc-1002"}'

# 5. Retry of doc-1001: replayed, nothing consumed again
curl -si -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"ahmad","units":10,"requestId":"doc-1001"}'

# 6. Plan change: a small custom shared plan
PLAN=$(curl -s -X POST $API/plans -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Tiny pool","scope":"account","monthlyAllowance":50,"maxUnitsPerRequest":100}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X PUT $API/account/plan -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d "{\"planId\":\"$PLAN\"}"
# sara (Premium) asks for 45 with 40 shared units left: rejected at the ACCOUNT level
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"sara","units":45,"requestId":"doc-1003"}'
# raise the plan (version 2) and retry with a new requestId: accepted
curl -s -X PATCH $API/plans/$PLAN -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"monthlyAllowance":500}'
curl -s -X POST $API/usage/consume -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"userId":"sara","units":45,"requestId":"doc-1004"}'

# 7. History and monthly summary
curl -s "$API/usage?pageSize=10&outcome=rejected" -H "X-API-Key: $KEY"
curl -s "$API/account/usage-summary?month=2026-10" -H "X-API-Key: $KEY"

# Dry run (never consumes or records)
curl -s -X POST $API/quotas/check -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"userId":"ahmad","units":5}'
```

</details>

---

## 📏 Quota rules

| Rule | Meaning |
|---|---|
| `MONTHLY_ALLOWANCE` | Total units per **UTC calendar month** |
| `MAX_UNITS_PER_REQUEST` | Largest amount a single request may consume |

Both rules apply on both levels. A request is accepted only if all four checks pass. They are checked
in a fixed order, and the **first failure** is reported as `rejection` (all failures appear in
`violations`):

1. user `MAX_UNITS_PER_REQUEST`
2. account `MAX_UNITS_PER_REQUEST`
3. user `MONTHLY_ALLOWANCE`
4. account `MONTHLY_ALLOWANCE`

Per-request rules come first because they do not depend on current usage. The user level comes before
the account level because it is the more specific limit. There is no partial consumption. The pure
evaluation lives in [`QuotaPolicy.ts`](backend/src/Domain/Quotas/QuotaPolicy.ts).

`remaining = max(0, allowance − consumed)`. Status is `ok` (< 80 %), `warning` (≥ 80 %), `exhausted`
(0 remaining) or `over_allowance` (consumed > allowance after a reduction).

<p align="center">
  <img src="docs/uml/svg/10-activity-quota-decision.svg" alt="Quota decision activity diagram" width="60%">
</p>

---

## 🗂️ Plans and plan changes

Predefined plans are seeded at every startup with fixed ids and are read-only.

| Plan | Scope | Monthly allowance | Max per request | id |
|---|---|---|---|---|
| Starter | account | 10,000 | 100 | `00000000-0000-4000-8000-000000000001` |
| Pro | account | 100,000 | 500 | `00000000-0000-4000-8000-000000000002` |
| Basic | user | 1,000 | 20 | `00000000-0000-4000-8000-000000000003` |
| Premium | user | 10,000 | 200 | `00000000-0000-4000-8000-000000000004` |

New accounts start on **Starter** and new users on **Basic** unless another plan is given.

- Plans live in the database, so changes apply **without redeploying**.
- Changing a limit of a custom plan inserts a new **immutable version**; every account or user on the
  plan uses it from the next request. Renames do not create versions.
- Switching plans **keeps the units already consumed** this month: counters belong to the account or
  user and the month, not to the plan.
- Reducing an allowance below current usage shows 0 remaining and rejects that level until it is raised
  or the month changes.
- History is never rewritten: each record stores both plan versions that decided it.
- Predefined plans answer `403 PLAN_READ_ONLY`; a plan of the wrong scope answers `422 PLAN_SCOPE_MISMATCH`
  (also enforced by a foreign key); another account's plan answers `404`.

---

## 🔁 Idempotency and retries

- `requestId` is the idempotency key, scoped to the account (`UNIQUE (account_id, request_id)`); the
  fingerprint is `(userId, units)`.
- **Same key, same payload:** the stored decision (accepted **or** rejected) is returned with
  `"idempotentReplay": true` and the header `Idempotent-Replayed: true`. Nothing is consumed again.
- **Same key, different payload:** `409 IDEMPOTENCY_KEY_REUSED`.
- To re-evaluate after a plan change, send a **new** `requestId`.
- Concurrent duplicates wait for the first copy to commit and then replay it (tested with 30
  simultaneous copies: one record, one consumption).
- The decision and the idempotency record are written in one transaction, so retrying after a timeout
  is always safe.

---

## ⚙️ Concurrency

Consumption is never "read, check in memory, write". The whole decision is one PostgreSQL transaction
([`ConsumeUnitsCommand`](backend/src/Application/Modules/Usage/Commands/ConsumeUnitsCommand.ts)):

1. `pg_advisory_xact_lock(hash(account, requestId))`: concurrent copies of one request queue here.
2. Look up the request id: replay or `409`.
3. `SELECT … FOR UPDATE` the **account** counter, then the **user** counter. The fixed order prevents deadlocks.
4. Read both current plan versions **after** the locks.
5. Evaluate with the pure domain function.
6. If accepted, increment both counters.
7. Insert the usage record (accepted or rejected).
8. Commit. Deadlock or serialization errors retry the whole unit up to 3 times.

Row locks make the default READ COMMITTED isolation sufficient, and nothing relies on in-process mutexes,
so several API instances can share the database. Tests fire up to 150 simultaneous requests and verify
that **counters = sum of accepted records** at both levels and that no limit is exceeded, even during
concurrent plan changes.

<p align="center">
  <img src="docs/uml/svg/02-sequence-consume.svg" alt="Consume sequence diagram" width="90%">
</p>

---

## 🤖 AI Usage Advisor

`POST /api/v1/ai/advisor` (the **AI Advisor** page). The service computes the facts (quotas, rejections
by rule, top accounts and users, daily volume, unusual days) and the model only explains them as
validated JSON. With an account token it sees only that account; the operator sees cross-account
aggregates. The model cannot query the database or change anything.

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `mock` | `mock` (deterministic, labelled) or `openai` (OpenAI or any OpenAI-compatible API) |
| `OPENAI_API_KEY` | – | Required for `openai`; server-side only |
| `OPENAI_MODEL` | – | Required for `openai`; verified at startup |
| `OPENAI_BASE_URL` | – | An OpenAI-compatible API, e.g. `https://openrouter.ai/api/v1` |
| `OPENAI_TIMEOUT_MS` / `AI_MAX_OUTPUT_TOKENS` | 20000 / 800 | Per attempt / output budget (reasoning models need about 3000) |
| `AI_RATE_LIMIT_PER_WINDOW` / `AI_RATE_LIMIT_WINDOW_MS` | 10 / 60000 | Per credential |

To enable it with Compose, create a `.env` file next to `docker-compose.yml` (it is ignored by Git):

```ini
AI_PROVIDER=openai
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=<your key>
OPENAI_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OPENAI_TIMEOUT_MS=40000
AI_MAX_OUTPUT_TOKENS=3000
```

Then run `docker compose up -d`. Provider errors are reported by kind (no credit, rate limit, rejected
key, cut-off answer) without leaking details.

<details>
<summary><b>AI advisor sequence diagram</b></summary>
<p align="center">
  <img src="docs/uml/svg/05-sequence-ai-advisor.svg" alt="AI advisor sequence diagram" width="90%">
</p>
</details>

---

## 🧪 Testing

Run `npm install` once in each folder first.

| Suite | Command | Needs |
|---|---|---|
| Frontend (Vitest + Testing Library) | `cd frontend && npm test` | nothing |
| Backend unit | `cd backend && npm test` | nothing |
| Backend integration (HTTP + real PostgreSQL) | `cd backend && npm run test:integration` | PostgreSQL |
| Backend concurrency | `cd backend && npm run test:concurrency` | PostgreSQL |
| Typecheck / lint / build | `npm run typecheck` · `npm run lint` · `npm run build` | nothing |

Database tests **recreate** the database in `TEST_DATABASE_URL` (its name must contain "test"). With
Compose: `TEST_DATABASE_URL=postgres://metering:metering@localhost:5433/metering_test`.

Latest run: 40 unit, 128 integration and 5 concurrency tests in the backend, and 82 frontend tests, all
passing. They cover the brief's worked examples, rule order and boundaries, authentication (API keys,
JWT expiry, refresh rotation and reuse, roles), account isolation, idempotent replay, plan versions and
scope, month rollover with an injectable clock, pagination and filters, migrations and seed
idempotency, rollback, AI scope and provider failures, and the full Client Demo scenario.

---

## 📈 Performance

Full method and results: [backend/tests/performance/RESULTS.md](backend/tests/performance/RESULTS.md).
Laptop, API + PostgreSQL + load generator on one machine, 50 connections:

| Scenario | Before | After |
|---|---|---|
| Hot: 1 account, 200 users (one counter row) | 365 req/s, p90 249 ms | 395 req/s, p90 137 ms |
| Spread: 50 accounts × 20 users | 798 req/s | 935 req/s |
| History pages | 289 req/s, p50 162 ms | 678 req/s, p50 75 ms |
| Limit: 4,000 × 10 units vs a 20,000 allowance | exactly 2,000 accepted | exactly 2,000 accepted |

After every run, counters equal the sum of accepted records and no counter exceeds its allowance.
Durability was not traded for speed (`synchronous_commit` stays on).

---

## 💻 Local development

**Requirements:** Node.js 22+ and PostgreSQL 15+.

```bash
# Backend (terminal 1)
cd backend
npm install
cp .env.example .env          # set DATABASE_URL, ADMIN_API_TOKEN and JWT_SECRET
npm run dev                   # http://localhost:3000 (migrates and seeds on start)
```

```bash
# Frontend (terminal 2)
cd frontend
npm install
npm run dev                   # http://localhost:5173 with the in-browser mock adapter
npm run dev:api-mode          # http://localhost:5174 against the real API on :3000
```

`npm run db:migrate` and `npm run db:seed` (in `backend/`) run the startup steps by hand. When the API
contract changes, update `backend/src/contracts` and copy the change to `frontend/src/contracts`;
`diff -r backend/src/contracts frontend/src/contracts` must print nothing.

---

## 📝 Product assumptions

| # | Assumption | Reasoning |
|---|---|---|
| 1 | Units are integers from 1 to 1,000,000 per request; counters are BIGINT. | No floating point; absurd input is rejected early. |
| 2 | The period is the **UTC** month of the server's processing time. | Usage belongs to the month it is processed; client clocks are not trusted. |
| 3 | Fixed rule order; the first failure is reported and all are listed. | Deterministic, and the most specific cause comes first. |
| 4 | A quota rejection is `200` with `accepted: false`; validation is `400`, authentication `401`. | A rejection is a valid business answer; clients branch on `accepted`. |
| 5 | Rejected decisions are stored and replayed. | History shows rejections and retries get a stable answer. |
| 6 | Callers identify users by their own `externalUserId`, unique per account. | Clients do not need to store our ids. |
| 7 | Consuming for an unknown user is `404 USER_NOT_FOUND` and is not recorded. | Users are registered explicitly. |
| 8 | New accounts default to Starter and new users to Basic. | Custom plans belong to an account that does not exist yet at creation. |
| 9 | Custom plan names are unique per account (case-insensitive). | Avoids confusing duplicates. |
| 10 | Utilization ≥ 80 % means "approaching the limit"; an allowance of 0 counts as 100 %. | One documented threshold used everywhere. |
| 11 | Dry runs (`/quotas/check`) are advisory and never recorded. | Consume re-checks atomically. |
| 12 | Past-month quota views compare that month's consumption with the plan's **current** limits. | Each record keeps the exact plan version that decided it. |
| 13 | The operator credential is a single configured secret, exchanged for an operator JWT. | End-user RBAC is outside the brief. |

---

## ⚖️ Design decisions and trade-offs

- **Counters instead of summing records.** Decisions read one counter row (O(1) and lockable). The
  record table remains the audit trail, and the tests check that both agree.
- **Plain SQL with `pg`.** Explicit, reviewable queries; the concurrency-critical SQL is not hidden behind an ORM.
- **JWT for the web app, API keys for machines.** Browsers use short-lived access tokens with rotating
  refresh cookies; server-to-server clients may keep sending `X-API-Key`, as the brief requires.
- **SHA-256 for keys and tokens.** Suitable for 256-bit random secrets and allows indexed lookup.
- **Two independent parts.** `backend/` and `frontend/` share no build tooling and deploy separately; the
  price is that the contract files exist twice.
- **Frontend state.** TanStack Query for server state, URL search params for filters, sorting and
  pagination, lazy-loaded pages, and a mock adapter behind the same interfaces as the HTTP adapter.
- **Same-origin API.** nginx proxies `/api/*`, which removes CORS from the browser path and allows a strict CSP.

---

## ⚠️ Known limitations

- The operator credential is a single static secret, with no rotation endpoint yet.
- Quota views for past months use the current plan limits (records keep the exact versions).
- One account's consumes serialize on its counter row (~400 decisions/s for a single account on the test
  laptop); many accounts scale independently. Sharded counters would be the next step.
- History totals use `count(*)`, which costs about 90 ms for very large single-account months (cursor
  pagination would avoid it).
- The AI advisor was verified through OpenRouter with a free model (15–25 s per answer, rate-limited by
  the provider), not against OpenAI itself.
- `npm audit` reports advisories only in dev tooling, which is not part of any image.

---

## 📐 UML diagrams

All diagrams are written in [PlantUML](https://plantuml.com/) and live in [`docs/uml`](docs/uml), with
rendered SVG and PNG files next to the sources. The architecture, domain, security, quota and
concurrency sections above embed the most relevant ones.

| # | Type | Diagram | Shows |
|---|---|---|---|
| 01 | Use case | [Use cases](docs/uml/svg/01-use-cases.svg) · [source](docs/uml/01-use-cases.puml) | Actors and what each can do |
| 02 | Sequence | [Consume units](docs/uml/svg/02-sequence-consume.svg) · [source](docs/uml/02-sequence-consume.puml) | How one request is checked, counted and saved; retries are replayed |
| 03 | Sequence | [JWT authentication](docs/uml/svg/03-sequence-jwt-auth.svg) · [source](docs/uml/03-sequence-jwt-auth.puml) | Sign-in, using the app, automatic refresh, sign-out |
| 04 | Sequence | [Sign-up](docs/uml/svg/04-sequence-signup.svg) · [source](docs/uml/04-sequence-signup.puml) | Request, approval or denial, one-time key collection |
| 05 | Sequence | [AI advisor](docs/uml/svg/05-sequence-ai-advisor.svg) · [source](docs/uml/05-sequence-ai-advisor.puml) | Question, usage numbers, AI answer |
| 06 | Class | [Domain model](docs/uml/svg/06-class-domain.svg) · [source](docs/uml/06-class-domain.puml) | Entities, value objects and the quota policy |
| 07 | Component | [Architecture](docs/uml/svg/07-component-architecture.svg) · [source](docs/uml/07-component-architecture.puml) | Frontend and backend layers |
| 08 | Deployment | [Docker Compose](docs/uml/svg/08-deployment.svg) · [source](docs/uml/08-deployment.puml) | Containers, network, volume, ports |
| 09 | ER | [Database schema](docs/uml/svg/09-er-database.svg) · [source](docs/uml/09-er-database.puml) | Tables, keys and constraints (migrations 001 to 005) |
| 10 | Activity | [Quota decision](docs/uml/svg/10-activity-quota-decision.svg) · [source](docs/uml/10-activity-quota-decision.puml) | How one consume request is accepted or rejected |
| 11 | State | [Sign-up request](docs/uml/svg/11-state-signup-request.svg) · [source](docs/uml/11-state-signup-request.puml) | Life cycle of a sign-up request |
| 12 | State | [Refresh token](docs/uml/svg/12-state-refresh-token.svg) · [source](docs/uml/12-state-refresh-token.puml) | Life cycle of a refresh token |

### Use cases

<p align="center">
  <img src="docs/uml/svg/01-use-cases.svg" alt="Use case diagram" width="90%">
</p>

### State machines

<table>
  <tr>
    <th>Sign-up request</th>
    <th>Refresh token</th>
  </tr>
  <tr>
    <td><img src="docs/uml/svg/11-state-signup-request.svg" alt="Sign-up request state diagram"></td>
    <td><img src="docs/uml/svg/12-state-refresh-token.svg" alt="Refresh token state diagram"></td>
  </tr>
</table>

After editing a `.puml` file, render all diagrams again (set `PLANTUML_SERVER` to use your own server):

```bash
node docs/uml/render.mjs
```

---

## 📚 Documentation

| Document | Contents |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Plain-language guide to every page of the web app |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Endpoints, DTOs, error codes |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, normalization, constraints, indexes |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentication, permissions, page separation, security controls |
| [backend/tests/performance/RESULTS.md](backend/tests/performance/RESULTS.md) | Load test method and results |
| [docs/uml](docs/uml) | PlantUML sources and rendered diagrams |

---

<div align="center">

Final Project of the Boot.dev Plan (TypeScript), 2026-C3

Built by [Qais Rjoob](https://github.com/QaisRjoob)

</div>
