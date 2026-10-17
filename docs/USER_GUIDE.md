# User Guide — trying the app in the browser

This guide explains what the app is and walks you through both web interfaces. No programming is
needed: you only click and read. For setup details and the API itself, see the [README](../README.md).

---

## 1. What is this app?

Imagine a company that sells an online **document-processing tool**. Every document its users process
costs **units** (credits). The company has a monthly budget of units for everyone together, and each
of its users also has a personal monthly limit.

The **Usage Metering & Quota Service** is the part that keeps score. Before the company's tool
processes a document, it asks the service: *"May user alice use 10 units right now?"* The service:

1. checks **two plans at the same time**:
   - the **account plan** — the company's shared budget (for example 10,000 units per month, at most
     100 units in one request), and
   - the **user plan** — alice's personal limit (for example 1,000 units per month, at most 20 per
     request);
2. answers **accepted** or **rejected**. A rejection always says **which rule** blocked it
   (*monthly allowance* or *max units per request*) and **whose rule** it was (*account* or *user*);
3. if accepted, counts the units for both alice and the company; if rejected, counts nothing;
4. remembers every decision, so you can look at history for any month.

It also handles the awkward cases correctly: if the company's tool sends the same request twice (for
example after a network error), the units are counted **once**; and if many requests arrive at the
same moment, the limits are never exceeded.

### The words used in the app

| Word | Meaning |
|---|---|
| **Account** | A company (an application) that uses the service. It has one secret **API key**. |
| **User** | A person using that company's tool, for example `alice`. Belongs to one account. |
| **Plan** | A set of two limits: **monthly allowance** and **max units per request**. Account plans are shared by all users of the account; user plans are personal. |
| **Predefined plan** | A ready-made plan everyone can use: Starter, Pro (account) and Basic, Premium (user). They cannot be edited. |
| **Custom plan** | A plan an account creates for itself. It can be edited; every edit creates a new **version**. |
| **Remaining** | Units still available this month. Never below 0. |
| **Request ID** | A label the calling tool attaches to each request. Sending the same ID again repeats the original answer instead of consuming again. |

### Two kinds of people, two separate interfaces

| Role | Signs in with | Their interface |
|---|---|---|
| **Operator** — the people running the service | the **admin token** | the **Operator console** (`/admin`): every company, plan catalogue, history across companies |
| **Company** — a business using the service | its account **API key** | the **Account portal** (`/app`): its own users, plans, quotas, history, and the Client Demo |

Each role only ever sees its own interface. A company owner cannot open operator pages and the
operator cannot open a company's portal; trying it simply sends you back to your own home page.
Only one role is signed in at a time.

---

## 2. Start the app

You need Docker Desktop running. In the project folder run:

```bash
docker compose up -d
```

(the first time, or after changing code: `docker compose up --build -d`).

Wait until the three containers `postgres`, `api` and `web` show as running in Docker Desktop, then
open **http://localhost:8080**.

To start from a completely fresh demo (all usage erased):

```bash
docker compose down -v
docker compose up -d
```

> **No Docker?** You can still click through the interface with built-in fake data:
> `cd frontend`, `npm install`, `npm run dev`, then open http://localhost:5173. A yellow
> **MOCK DATA** badge is shown; the mock admin token is `mock-admin-token`.

### The two credentials (local demo values)

| Credential | Value | Where it comes from |
|---|---|---|
| Admin token (operator) | `local-admin-token-change-me` | set in `docker-compose.yml` (`ADMIN_API_TOKEN`) |
| Demo company API key | `umk_demo_local_only_do_not_use_in_production` | created automatically at startup for the company **Demo Docs Inc** |

These are public example values for trying the app on your own computer only.

---

## 3. Signing in

The app opens on the **login page**, which has a single field: **Access token or API key**. Paste
what you were given and press **Sign in** — you do not choose a role. The service recognises the
token and opens the right interface:

- a **company API key** (it starts with `umk_`) opens that company's **Account portal**;
- the **operator token** opens the **Operator console**.

For the local demo there is a **Use demo company key** button. An unknown token is refused with one
message ("This is neither a valid API key nor the operator token") and nothing is stored.

The header always shows who you are (the company name, or *Operator*) and a **Sign out** button.
Signing in with one role signs you out of the other. Credentials are kept only in this browser tab.

---

## 4. Finding things: filters, sorting and pages

Every list (accounts, users, plans, quotas, usage history) has the same filter area on top:

- a **search box** — results update as you pause typing;
- **quick filter buttons** — one click, e.g. *All / Healthy / Approaching limit / Exhausted / Over
  allowance*, or *All requests / Accepted / Rejected* and *User limit / Account limit*;
- **More filters** — opens a panel with the advanced fields (plan, plan type, utilization range,
  units range, request id, replays, month, date ranges, account…). The button shows how many of them
  are active;
- **chips** under the filters — one per active filter, each with an **×** to remove it, plus **Clear
  all**, and the number of results;
- **sortable columns** — click a column title with ↕ to sort; click again to reverse (↑ / ↓ shows the
  direction);
- **pages** at the bottom — previous/next and how many rows per page (10, 20, 50, 100).

Filtering, sorting and paging all happen on the server, so they stay fast with lots of data. The
filters are part of the page address: you can bookmark or share a filtered view. If a filter is
impossible (for example a minimum bigger than the maximum), the field is marked and nothing is
loaded until you fix it.

---

## 5. Guided tour of the Account portal (about 10 minutes)

Sign in with the demo company key (`umk_demo_local_only_do_not_use_in_production`, or the **Use demo company key** button). Follow these steps in order on a fresh demo.

The demo company **Demo Docs Inc** uses a deliberately small shared plan, **Demo Shared Pool**: 100
units per month, at most 100 per request. It has three users:

| User | Plan | Personal limits |
|---|---|---|
| `alice` | Basic | 1,000 per month, at most 20 per request |
| `bob` | Premium | 10,000 per month, at most 200 per request |
| `carol` | Basic | 1,000 per month, at most 20 per request |

### Step 1 — Run the Client Demo

Click **Client Demo** in the sidebar. The page pretends to be the company's document tool:

- **Client application** (left) — choose a user, a document type or a number of units, then
  **Process document**.
- **Decision** (right) — the service's answer, and two cards side by side: **Account remaining
  (shared)** and **User remaining**. The card of the rule that blocked a request is outlined in red.
- **Guided scenario** — five steps with **Run** buttons.

Press **Run** on each step:

| # | What it sends | Expected answer | Why |
|---|---|---|---|
| 1 | alice, 10 units (invoice) | **Accepted** | Both plans allow it. Account: 90 of 100 left. alice: 990 of 1,000 left. |
| 2 | alice, 25 units (contract) | **Rejected** — *Max units per request*, **User (individual)** | Basic allows at most 20 per request. Nothing was counted. |
| 3 | bob, 95 units (annual report) | **Rejected** — *Monthly allowance*, **Account (shared)** | Only 90 shared units are left. bob personally still has 10,000 — the shared limit blocks him. |

### Step 2 — Change a plan and repeat

In the **Plan changes** panel on the same page, keep *alice* and *Premium* selected and click
**Switch plan**. Then press **Run** on step 2 again: now it is **Accepted**. The client did not
change — only the plan did. (Alternatively raise the shared plan's allowance under **Edit the shared
account plan** and repeat step 3.)

### Step 3 — Send the same request twice

Click **Retry same request**. You should see **Accepted** with the badge **Idempotent replay ·
nothing consumed again**, and the remaining numbers do not go down. All five checklist items are now ✓.

### Step 4 — The other account pages

| Page | What you can do |
|---|---|
| **Overview** | Your shared quota, this month's accepted/rejected requests, a daily usage chart, *why requests were rejected* (click a reason to open the matching history), and the users closest to their limits. **Change account plan** switches your shared plan. Pick another **Month (UTC)** to look back. |
| **Users** | All your users with plan, usage, remaining, status, this month's requests (accepted / rejected) and the last request. **Browse by category**: tabs with live counts for quota status, activity this month and user plan. **More filters**: rejections this month, utilization range, registration date range, month. Sort by name, usage, utilization, rejections, last request or registration date. **Register user** adds a user; **Change plan** switches a user's plan (units already used this month are kept). Click a user, or **Details**, to open them. |
| **User details** | One of your users: their quota and your shared quota, statistics for the month (accepted, rejected, rejection rate, last request), rejection reasons, daily usage, the last six months and their request history page by page. Change the month at the top right; **All users** goes back. |
| **Plans** | Predefined plans (locked, read-only) and your custom plans. Search, filter by type and scope, sort by name or limits. **New custom plan**, **Edit** (creates a new version; lowering an allowance asks for confirmation) and **Versions** (history of limits). |
| **Quotas** | Your shared quota and each user's quota, most-used first, with the same user filters. **Check a request (dry run)** answers "would this be allowed?" without using units. |
| **Usage history** | Every request with outcome, rule, level, units and plan versions. Try: **Rejected** + **User limit**; *Units requested* 50 – 100 under **More filters**; *Retried: Replayed at least once*; a date range. Click a row for all details. |
| **AI Advisor** | Ask questions about your usage or click a suggestion. In the default setup a built-in **mock** advisor answers (clearly labelled). |

---

## 6. Tour of the Operator console

Sign out, then sign in with the operator token `local-admin-token-change-me`.

| Page | What you can do |
|---|---|
| **Overview** | Totals for the chosen month across all companies: units consumed, allocated units, overall utilization, companies at ≥ 80 %, daily trend, most-used companies, recent activity and six-month totals. |
| **Accounts** | Every company with plan (and units left), users, usage, utilization, status, this month's requests (accepted / rejected) and the time of the last request. **Search** finds a company by its name, its account id, its API key prefix (`umk_live_…`) or by one of its users (user id or display name). **Browse by category**: tabs with live counts for quota status, activity this month (active / no requests) and plan — click one to filter. **More filters**: plan type (predefined/custom), rejections this month, number of users, utilization range, creation date range, month. Sort by name, users, usage, utilization, rejections, last request or creation date. **Create account** issues a new API key — it is **shown only once**; copy it and give it to the company. Click a company to open its details. |
| **Account details** | Read-only view of one company for the chosen month: its shared quota, **company statistics** (accepted and rejected requests, units refused, rejection rate, users close to their limits, units left, last request), why requests were rejected (each chip opens the filtered history), a **daily usage** chart and the **last six months** of this company. Below: its users with the same category tabs (status, activity, plan) with counts, request and last-request columns and the same filters as the company's own Users page — click a user, or **Details**, to open that user — and recent requests. Changes to users and plans are made by the company in its own portal. |
| **User details** | One user of a company: their own quota and the company's shared quota, statistics for the month (accepted, rejected, rejection rate, last request), rejection reasons, daily usage, the last six months, and their **request history** page by page (request id, units, outcome, rule, plan versions, retries). Change the month at the top right. Reached from a company's users, from the Users directory, or from the finder. |
| **Company statistics** | Every company side by side for one month: totals on top (companies and how many had requests, users and active users, units consumed of units allocated, accepted and rejected requests, rejection rate), a **share of usage** chart of the busiest companies, and a table with active/total users, units used and share of all usage, utilization, accepted, rejected, rejection rate, status and last request. Sort by any of these; filter by activity, quota status or plan; search by name, id or key prefix. Click a company to open it. |
| **Users directory** | The end users of every company in one list: user id and name, company, plan, usage, utilization, status, requests this month and last request. Search by user id or name; the same category tabs (status, activity, plan) with counts; **More filters**: company (type part of its name), utilization range, registration date range, month. Sorted by most recent activity first; click a row to open that user's details, or the company name to open the company. |
| **Plan catalogue** | Every plan in the service — predefined and each company's custom plans — with the owner and how many accounts/users use it. Filter by type, scope or owner account; sort by name, limits or creation date. |
| **Usage history** | All requests across companies with the same filters as the company history, plus an **Account** picker (type part of a company name). |
| **AI Advisor** | Questions about all companies, e.g. *"Which accounts are closest to exhausting their quotas?"* |

**Finder (top bar):** type anything — part of a company name, an account id, an API key prefix, a user id or a user's name — and pick a result to open that company or user directly. Use ↑ / ↓ and Enter with the keyboard.

Try it end to end: create an account in **Accounts**, copy its key, sign out, sign in with that
key, register a user in **Users**, and process documents for that user in
**Client Demo**.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| The page does not open | Make sure Docker Desktop is running and the three containers are started (`docker compose up -d`). |
| "This is neither a valid API key nor the operator token" | Check the value for typos and copy it again without extra characters; the demo values are in §2. |
| I typed an operator address but landed on my company overview | That is the role separation working: sign out and sign in as Operator. |
| "Fix the highlighted filter to see results" | A filter is impossible (e.g. minimum above maximum, end date before start date). Correct or remove it. |
| No rows, but I expected some | Look at the chips under the filters and remove some, or press **Clear all**. |
| Step 3 of the scenario is accepted instead of rejected | The shared pool was already used by earlier tries. Start fresh with `docker compose down -v` then `docker compose up -d`, and run the steps in order. |
| "Too many requests" | The AI Advisor allows 10 questions per minute; wait a minute. |
