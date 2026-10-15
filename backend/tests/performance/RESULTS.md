# Performance results

All numbers below were measured on 2026-10-15 with the committed scripts. Raw output:
[`results/2026-10-15T10-29-10-054Z.json`](results/2026-10-15T10-29-10-054Z.json) (baseline) and
[`results/2026-10-15T10-33-08-201Z.json`](results/2026-10-15T10-33-08-201Z.json) (after improvements);
query plans: [`explain-output.txt`](explain-output.txt).

## Environment

| | |
|---|---|
| Machine | Laptop, Intel Core i7-8750H (6 cores / 12 threads), 32 GB RAM, Windows 11 |
| Database | PostgreSQL 17.11, native Windows service, default configuration, same machine |
| API | `node dist/server.js` (production bundle), Node 24.20, `DATABASE_POOL_MAX=20`, `LOG_LEVEL=warn` |
| Load generator | autocannon 8 on the same machine, 50 connections, 15 s per timed scenario |

The API, the database and the load generator share one laptop, so absolute numbers are
conservative and only the relative changes are meaningful.

## How to reproduce

```bash
# 1. an empty database and the built API
cd backend
npm run build
# (create an empty database, e.g. metering_perf), then start the API with:
#   DATABASE_URL=postgres://.../metering_perf ADMIN_API_TOKEN=perf-admin-token-1234567890 \
#   SEED_DEMO_DATA=false LOG_LEVEL=warn ACCOUNT_CREATE_RATE_LIMIT_PER_MINUTE=10000 PORT=3200 node dist/server.js

# 2. the load test (creates its own accounts, users and plans through the API)
API_URL=http://127.0.0.1:3200/api/v1 ADMIN_API_TOKEN=perf-admin-token-1234567890 \
DATABASE_URL=postgres://.../metering_perf DURATION=15 CONNECTIONS=50 npm run test:perf

# 3. optional: 500k-row history dataset + EXPLAIN ANALYZE of the main queries
DATABASE_URL=postgres://.../metering_perf ROWS=500000 npm run perf:seed
```

Dependencies: Node 22+, a PostgreSQL 15+ server, `npm install` in `backend/` (autocannon and pg are backend dependencies). Run all commands from `backend/`.
With Docker Compose, point `DATABASE_URL` at `postgres://metering:metering@localhost:5433/...`.

## Scenarios

| Scenario | What it stresses |
|---|---|
| **hot** | 1 account, 200 users, random 1–10 units. Every request locks the **same account counter row**. |
| **spread** | 50 accounts × 20 users. Load spread over many counter rows. |
| **limit** | 1 account with 20,000 units; 4,000 requests of 10 units fired with 50 connections. Exactly 2,000 may be accepted. |
| **history** | `GET /usage?pageSize=20&page=N`, random N, on the hot account (~5.5k records). |

After each write scenario the script checks in SQL that, for every affected account and user,
**counter = sum of accepted records**, and that **no counter exceeds its allowance**.

## Results

### Baseline

| Scenario | Requests | Throughput (req/s) | p50 ms | p90 ms | p99 ms | Accepted | Rejected | Errors |
|---|---|---|---|---|---|---|---|---|
| hot (1 account, 200 users) | 5,468 | 365 | 95 | 249 | 318 | 5,468 | 0 | 0 |
| spread (50 accounts × 20 users) | 11,972 | 798 | 61 | 70 | 83 | 11,972 | 0 | 0 |
| limit (contended last units) | 4,000 | 400 | 99 | 203 | 254 | **2,000** | 2,000 | 0 |
| history (paginated reads) | 4,342 | 289 | 162 | 219 | 292 | – | – | 0 |

### After the improvements

| Scenario | Requests | Throughput (req/s) | p50 ms | p90 ms | p99 ms | Accepted | Rejected | Errors |
|---|---|---|---|---|---|---|---|---|
| hot (1 account, 200 users) | 5,924 | 395 (+8 %) | 119 | 137 | 278 | 5,924 | 0 | 0 |
| spread (50 accounts × 20 users) | 14,019 | 935 (+17 %) | 52 | 61 | 72 | 14,019 | 0 | 0 |
| limit (contended last units) | 4,000 | 400 | 103 | 138 | 253 | **2,000** | 2,000 | 0 |
| history (paginated reads) | 10,164 | 678 (+135 %) | 75 | 96 | 119 | – | – | 0 |

Correctness check, both runs, every scenario: `accountCounterMismatches: 0`, `userCounterMismatches: 0`,
`countersOverAllowance: 0`. The limit scenario accepted exactly 2,000 of 4,000 requests both times.

## What we learned

### 1. History reads: join after paging (biggest win)

`EXPLAIN ANALYZE` of the history query showed PostgreSQL joining **all 5,518 records** of the account
with accounts, users and four plan/version lookups, then sorting them, and only then applying
`LIMIT 20 OFFSET n` (15 ms execution + 16 ms planning per page).

**Change:** a CTE first selects the page from `usage_records` alone (served in index order by
`(account_id, created_at DESC, id DESC)`), then joins only those 20 rows for display columns.
**Correctness:** the filter and the `ORDER BY created_at DESC, id DESC` (unique tie-breaker) are
unchanged, and every join follows a foreign key, so joins cannot add or drop rows — the page is
identical. **Effect:** 289 → 678 req/s, p50 162 → 75 ms.

### 2. The hot account counter is the write bottleneck (by design)

All consumes of one account serialize on its counter row (`SELECT … FOR UPDATE`). That lock is the
correctness guarantee — it is what makes the limit scenario accept exactly 2,000 — so the goal is to
hold it for less time, not to remove it.

**Change:** fewer database round trips inside the transaction:
- counter rows are created only when missing (`SELECT … FOR UPDATE`, and only on a miss
  `INSERT … ON CONFLICT DO NOTHING` + re-lock) instead of two inserts on every request;
- both plan versions are read in one query; both counters are updated in one statement.

The order is unchanged: idempotency lock → account counter lock → user counter lock → read plans →
evaluate → update → insert record → commit. **Effect:** hot p90 249 → 137 ms, +8 % throughput;
spread +17 %.

What remains under the lock is about 6 statements plus the commit's WAL flush, which caps a single
account at roughly 400 accepted decisions per second on this laptop. Ways to go further, deliberately
**not** taken:
- `synchronous_commit = off` would release locks before the WAL flush, but an acknowledged decision
  could be lost in a crash — unacceptable for metering.
- Sharding one account's counter into N sub-counters raises throughput but makes "remaining" checks
  need all shards (or reservations); more complexity than this project needs.

### 3. API-key lookups

Every request resolved its key with a query. A small in-process cache (key hash → account id, 60 s,
max 10,000 entries) removes that round trip. It is safe because the hash-to-account mapping never
changes (no key rotation or account deletion exists); unknown keys are never cached; quota decisions
never depend on cached data other than the immutable account id.

### 4. Large history (500k rows, `explain-output.txt`)

With 500,000 records in one account, a history page costs 6–11 ms (index scans, no sort). Deep
offsets stay cheap at this size (page 200: 8 ms). The slow parts are aggregates over a whole month of
a very large account: `count(*)` for the page total (87 ms over 155k rows) and the daily series
(130 ms). Next steps if needed: cursor pagination without a total count, or a daily rollup table
maintained in the consume transaction. Dashboard totals already avoid this by reading the counter
tables instead of raw records.
