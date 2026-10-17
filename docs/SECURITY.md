# Security and permissions

## Who can do what

There are three kinds of callers. The API decides from the credential alone; the web app mirrors
it with two separate interfaces, but the API never relies on the web app for protection.

| Caller | Credential | Can use | Cannot use |
|---|---|---|---|
| Anyone | none | `/health`, `/ready`, `POST /auth/token` / `refresh` / `logout`, `POST /signup-requests`, `/signup-requests/status`, `/signup-requests/claim` (with request id + claim code) | everything else (`401`) |
| A company | account JWT (`Authorization: Bearer`), or `X-API-Key: umk_…` for server-to-server clients | its own account, users, plans, quotas, usage, AI advisor | `/admin/*` (`401 TOKEN_MISSING`, or `403 INSUFFICIENT_ROLE` with an account token); other companies' data (`404`, never `403`, so their existence is not revealed) |
| The operator | operator JWT (`Authorization: Bearer`), obtained at `POST /auth/token` with `ADMIN_API_TOKEN` | `/admin/*` (every company, access requests, analytics), AI advisor across accounts | account-scoped routes such as `/users` or `/usage/consume` (`403 INSUFFICIENT_ROLE`): changes to a company's users and plans are made by that company |

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

- **JWT sessions**: `POST /auth/token` exchanges a credential for a 15-minute **access token** (JWT,
  HS256, signed with `JWT_SECRET`; claims `iss`, `aud`, `sub`, `role`, `iat`, `exp`, `jti`). The
  verifier pins the algorithm, issuer and audience (no `alg: none`, no key confusion) and checks
  expiry. The **refresh token** is an opaque random value in an `HttpOnly`, `SameSite=Strict`
  cookie scoped to `/api/v1/auth`, stored only as a hash. Each refresh rotates it; reusing a used
  one revokes the whole session (theft detection); logout revokes it. Refresh and logout also
  require `X-Requested-With: umk-web`, so a cross-site page cannot trigger them (CSRF).
- **In the browser** the access token lives in memory only; after a reload the session is restored
  through the refresh cookie. No credential is ever written to web storage or a URL.

- **API keys**: `umk_live_` + 256 random bits. Only the SHA-256 hash is stored (with a 13-character
  display prefix); the raw key is shown once. Lookups compare hashes through a unique index.
- **Operator token** (`ADMIN_API_TOKEN`): accepted only at `POST /auth/token`, compared in constant
  time (both sides hashed first), never part of the browser bundle; `/admin/*` accepts only the
  operator JWT it is exchanged for.
- **Claim codes** (sign-up): 192 random bits, stored as a hash, compared in constant time. A wrong
  code and an unknown request answer the same `404`, so request ids cannot be probed. The API key of
  an approved request is generated when it is claimed (once) and the cached lookup of the replaced
  placeholder key is invalidated.
- **Logs**: `Authorization` and `X-API-Key` headers are redacted; keys, tokens and claim codes are
  never logged.

## Abuse limits

| Limit | Default | Setting |
|---|---|---|
| Wrong credentials per IP (invalid access token, API key, sign-in credential, claim code) → 429 for the rest of the minute | 20 / min | `AUTH_FAILURE_LIMIT_PER_MINUTE` |
| Sign-in attempts per IP | 20 / min | `LOGIN_RATE_LIMIT_PER_MINUTE` |
| Sign-up requests per IP | 10 / min | `SIGNUP_RATE_LIMIT_PER_MINUTE` |
| Accounts created by the operator per IP | 30 / min | `ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE` |
| AI advisor calls per credential | 10 / min | `AI_RATE_LIMIT_PER_WINDOW` |
| Request body size | 64 KB | — |

The client IP is the socket address. `X-Forwarded-For` is trusted only from proxies you name:
`TRUST_PROXY_ADDRESSES` (exact addresses; in Docker, the web container that forwards `/api` and
overwrites the header) or `TRUST_PROXY_HOPS`. Anyone else's header is ignored, otherwise a client
could fake an IP per request and step around every per-IP limit.

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
- **Same-origin API**: nginx forwards `/api/*` to the API, so the browser only ever talks to the
  origin it loaded the page from: no cross-origin requests, and CORS is only for direct callers.
- **Web (nginx)**: `Content-Security-Policy` (scripts only from the app itself, no inline scripts,
  API calls only to the same origin, no framing), `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, no server version.
- **Containers**: the API runs as the unprivileged `node` user; Compose publishes ports on the
  loopback addresses only (`127.0.0.1` and `::1`), so the local stack is not reachable from the
  network, and restarts it automatically after Docker or the computer restarts.

## Before a real deployment

The repository ships demo values so the stack runs with one command. The API prints a
`SECURITY:` warning at start-up in production mode while any of these remain:

1. Set `ADMIN_API_TOKEN` and `JWT_SECRET` to long random values (`openssl rand -base64 48`), and
   `COOKIE_SECURE=true` once served over HTTPS.
2. Set `SEED_DEMO_DATA=false` (the demo API key is public).
3. Keep the same-origin `/api` proxy (or list the real web origin in `CORS_ORIGINS` and build the
   web image with the real `VITE_API_BASE_URL` and `API_ORIGIN`).
4. Serve both behind HTTPS (and set `TRUST_PROXY_HOPS` to the number of proxies in front of the API).
