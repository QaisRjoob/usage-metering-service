# Security and permissions

## Who can do what

There are three kinds of callers. The API decides from the credential alone; the web app mirrors
it with two separate interfaces, but the API never relies on the web app for protection.

| Caller | Credential | Can use | Cannot use |
|---|---|---|---|
| Anyone | none | `/health`, `/ready`, `POST /auth/identify`, `POST /signup-requests`, `/signup-requests/status`, `/signup-requests/claim` (with request id + claim code) | everything else (`401`) |
| A company | `X-API-Key: umk_…` | its own account, users, plans, quotas, usage, AI advisor | `/admin/*` (`401 ADMIN_TOKEN_MISSING`); other companies' data (`404`, never `403`, so their existence is not revealed) |
| The operator | `Authorization: Bearer <ADMIN_API_TOKEN>` | `/admin/*` (every company, access requests, analytics), AI advisor across accounts | account-scoped routes such as `/users` or `/usage/consume` (`401 API_KEY_MISSING`): changes to a company's users and plans are made by that company |

Every account route reads the account id **only** from the API key, and every query is scoped by
it; ids in the URL or body never select another tenant. These rules are covered by
`tests/integration/auth.test.ts`, `isolation.test.ts`, `portal.test.ts` and `signup.test.ts`.

## Page separation (web app)

| Area | URL | Guard |
|---|---|---|
| Public | `/login`, `/signup`, `/signup/status` | none |
| Operator console | `/admin/*` | operator session only |
| Account portal | `/app/*` | company session only |

Not signed in → login page (with the requested page remembered). Signed in with the other role →
your own home. Only one role is signed in at a time. If the server rejects the stored credential
(wrong or replaced token, key no longer valid), the session ends and the login page opens.

## Credentials and secrets

- **API keys**: `umk_live_` + 256 random bits. Only the SHA-256 hash is stored (with a 13-character
  display prefix); the raw key is shown once. Lookups compare hashes through a unique index.
- **Admin token**: compared in constant time (both sides hashed first). It is never sent to the
  browser bundle: the operator types it at sign-in.
- **Claim codes** (sign-up): 192 random bits, stored as a hash, compared in constant time. A wrong
  code and an unknown request answer the same `404`, so request ids cannot be probed. The API key of
  an approved request is generated when it is claimed (once) and the cached lookup of the replaced
  placeholder key is invalidated.
- **In the browser**: credentials live in memory and `sessionStorage` (this tab only), never in
  URLs, query keys or `localStorage`. Secrets travel in headers or JSON bodies, never in a URL.
- **Logs**: `Authorization` and `X-API-Key` headers are redacted; keys, tokens and claim codes are
  never logged.

## Abuse limits

| Limit | Default | Setting |
|---|---|---|
| Wrong credentials per IP (admin token, API key, login token, claim code) → 429 for the rest of the minute | 20 / min | `AUTH_FAILURE_LIMIT_PER_MINUTE` |
| Sign-in attempts per IP | 20 / min | `LOGIN_RATE_LIMIT_PER_MINUTE` |
| Sign-up requests per IP | 10 / min | `SIGNUP_RATE_LIMIT_PER_MINUTE` |
| Accounts created by the operator per IP | 30 / min | `ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE` |
| AI advisor calls per credential | 10 / min | `AI_RATE_LIMIT_PER_WINDOW` |
| Request body size | 64 KB | — |

The client IP is the socket address. `X-Forwarded-For` is trusted only when `TRUST_PROXY_HOPS` is
set (for a reverse proxy you control); otherwise anyone could fake an IP per request and step
around every per-IP limit.

## Input and data

- Every body, query and path parameter is validated with the shared zod schemas before use;
  unknown sort keys, reversed ranges and malformed ids answer `400`.
- All SQL is parameterized; sort columns come from a whitelist, never from the request.
- The database enforces the business rules a second time (foreign keys, checks, unique keys; see
  [DATABASE.md](DATABASE.md)).
- Errors use one envelope; unexpected errors answer `500 INTERNAL_ERROR` without stack traces.

## HTTP hardening

- **API**: helmet headers (`X-Content-Type-Options`, `X-Frame-Options`, HSTS, …), CORS limited to
  `CORS_ORIGINS`, request and connection timeouts.
- **Web (nginx)**: `Content-Security-Policy` (scripts only from the app itself, no inline scripts,
  API calls only to `API_ORIGIN`, no framing), `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, no server version.
- **Containers**: the API runs as the unprivileged `node` user; Compose publishes ports on
  `127.0.0.1` only, so the local stack is not reachable from the network.

## Before a real deployment

The repository ships demo values so the stack runs with one command. The API prints a
`SECURITY:` warning at start-up in production mode while any of these remain:

1. Set `ADMIN_API_TOKEN` to a long random value (`openssl rand -base64 48`).
2. Set `SEED_DEMO_DATA=false` (the demo API key is public).
3. List the real web origin in `CORS_ORIGINS` and build the web image with the real
   `VITE_API_BASE_URL` and `API_ORIGIN`.
4. Serve both behind HTTPS (and set `TRUST_PROXY_HOPS` to the number of proxies in front of the API).
