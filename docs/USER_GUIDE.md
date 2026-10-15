# User Guide — trying the app in the browser

This guide explains what the app is and walks you through every page of the web interface. No
programming is needed: you only click and read. For setup details and the API itself, see the
[README](../README.md).

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

### Two kinds of people use the web app

| Role | Signs in with | Pages |
|---|---|---|
| **Operator** (runs the service) | the **admin token** | Dashboard, Accounts, history across all accounts, AI Advisor for all accounts |
| **Account** (a company using the service) | that account's **API key** | Plans, Quotas, Client Demo, its own history, AI Advisor for its own data |

The **Client Demo** page pretends to be the company's document-processing tool, so you can watch the
service make decisions.

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
| Demo account API key | `umk_demo_local_only_do_not_use_in_production` | created automatically at startup for the account **Demo Docs Inc** |

These are public example values for trying the app on your own computer only.

---

## 3. The screen layout

- **Left sidebar** — the pages, in three groups: *Operator* (Dashboard, Accounts), *Account* (Plans,
  Quotas, Client Demo) and *Insights* (Usage history, AI Advisor). On a phone it opens from the ☰ button.
- **Top bar** — shows whether an operator token and an account key are connected, and the
  **Credentials** button to connect or disconnect them at any time.
- When a page needs a credential you have not entered yet, it shows a small form instead of the page
  (*"Operator access required"* or *"Connect an account"*). Enter the value and press **Connect**.

Credentials are kept only in this browser tab. Closing the tab forgets them.

---

## 4. Guided tour (about 10 minutes)

Follow these steps in order on a fresh demo. Each step says what to do and what you should see.

### Step 1 — Connect the demo account

1. Click **Client Demo** in the sidebar.
2. In the *Connect an account* box, click **Use seeded demo key**, then **Connect**.
3. The top bar now shows **Demo Docs Inc**.

The demo account uses a deliberately small shared plan, **Demo Shared Pool**: 100 units per month,
at most 100 per request. It has three users:

| User | Plan | Personal limits |
|---|---|---|
| `alice` | Basic | 1,000 per month, at most 20 per request |
| `bob` | Premium | 10,000 per month, at most 200 per request |
| `carol` | Basic | 1,000 per month, at most 20 per request |

### Step 2 — Run the scenario on the Client Demo page

The page has three parts:
- **Client application** (left) — the pretend document tool: choose a user, a document type (each
  type costs a number of units) or type units, then **Process document**.
- **Decision** (right) — the service's answer, and two cards side by side: **Account remaining
  (shared)** and **User remaining**. The card of the rule that blocked a request is outlined in red.
- **Guided scenario** — five steps with **Run** buttons that fill in the right user and units for you.

Press **Run** on each step:

| # | What it sends | Expected answer | Why |
|---|---|---|---|
| 1 | alice, 10 units (invoice) | **Accepted** | Both plans allow it. Account: 90 of 100 left. alice: 990 of 1,000 left. |
| 2 | alice, 25 units (contract) | **Rejected** — *Max units per request*, **User (individual)** | Basic allows at most 20 per request. Nothing was counted. |
| 3 | bob, 95 units (annual report) | **Rejected** — *Monthly allowance*, **Account (shared)** | Only 90 shared units are left. bob personally still has 10,000 — the shared limit is what blocks him. |

### Step 3 — Change a plan and repeat

Below the decision, the **Plan changes (account configuration)** panel acts like the company's
settings screen:

1. Under **Switch a user's plan**, keep *alice* and *Premium* selected and click **Switch plan**.
2. Press **Run** on scenario step 2 again (alice, 25 units).
3. Now it is **Accepted**. The client code did not change — only the plan did. alice keeps the 10 units
   she already used this month; switching plans never gives a fresh allowance.

(Alternatively, under **Edit the shared account plan**, raise the monthly allowance, for example to
1000, click **Save allowance**, and repeat step 3 — bob's 95 units are then accepted.)

### Step 4 — Send the same request twice

Click **Retry same request**. This re-sends exactly the last request, with the same request ID —
what a real tool does after a network timeout.

You should see **Accepted** with the badge **Idempotent replay · nothing consumed again**. The
remaining numbers do not go down. All five checklist items are now ticked ✓.

The **Request log (this session)** at the bottom lists everything you sent.

---

## 5. The other pages

### Quotas (account)

Shows the connected account's **shared quota** for the current month and, below, every user's
**individual quota**: monthly allowance, used, remaining, a progress bar and a status badge.

| Badge | Meaning |
|---|---|
| Healthy | below 80 % used |
| Approaching limit | 80 % or more used |
| Exhausted | nothing left this month |
| Over allowance | the allowance was lowered below what was already used (remaining shows 0) |

**Check a request (dry run)** answers *"would this be allowed?"* without using any units and without
recording anything. Try user `alice` with `30` units.

### Plans (account)

Lists the four predefined plans (marked **Predefined**, with a lock — read-only) and the account's
custom plans. Filter by **Type** (predefined/custom) and **Scope** (account/user).

- **New custom plan** — give it a name, choose *User plan (individual limits)* or *Account plan
  (shared limits)*, and set the monthly allowance and the max units per request.
- **Edit** (custom plans only) — changing a limit creates a new version that applies to the next
  request immediately. If you **lower** a monthly allowance, the app asks you to confirm, because
  users who already used more will be blocked until next month.
- **Versions** — the history of a plan's limits. Old decisions keep the version that was in force.

### Usage history (account or operator)

Every request with its outcome. At the top choose **Connected account** or **All accounts
(operator)**. Filter by user, outcome (accepted/rejected), month, and a date range, then **Apply
filters**. Each row shows the time (UTC), user, request ID, units requested/used, the outcome, the
rule and level of a rejection, and the plan versions used. Click a row to see every detail. Pages of
10–100 rows; previous months are available.

### Dashboard (operator)

Click **Dashboard** and enter the admin token `local-admin-token-change-me`. It shows, for the chosen
month (**Month (UTC)** selector):

- **Units consumed**, accepted and rejected requests;
- **Allocated** — the sum of all account plans' monthly allowances, and how much is left;
- **Overall utilization**;
- **Accounts ≥ 80 %** — accounts close to or over their limit;
- a daily **Usage trend** chart, a **Quota utilization** chart of the most-used accounts, **Recent
  activity**, and **Monthly totals** for the last six months.

### Accounts (operator)

All accounts with their plan, usage this month, utilization and status. Search by name or ID, filter
by status, sort, and page through the list.

**Create account**: enter a name, choose Starter or Pro, and click **Create account**. The new
**API key is shown only once** — copy it. **Use this key in this tab** connects you as that account
right away; **I have stored the key** closes the window.

Click an account to open its **details**: its plan and quota, request counts, its users with their
quotas, and recent requests. Use the **Month (UTC)** selector to look at earlier months. Registering
users and changing plans require that account's own API key — click **Connect this account's key**
(after creating an account you are already connected). Then **Register user**, **Change plan** (per
user) and **Change account plan** become available.

Try it: create an account, register a user, then go to **Client Demo** and process documents for that
user.

### AI Advisor (account or operator)

Ask questions about usage in plain language, or click a suggested question such as *"Which users are
closest to their individual limits?"*. Choose **Connected account** (answers about that account only)
or **All accounts (operator)**. The answer shows the period and the data it used. In the default setup
the answers come from a built-in **mock** advisor (clearly labelled) that restates the service's own
numbers; a real AI model can be enabled with an OpenAI key (see the README).

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| The page does not open | Make sure Docker Desktop is running and the three containers are started (`docker compose up -d`). |
| "Invalid API key" / "Invalid admin token" | Check the value for typos; the demo values are in §2. |
| Step 3 of the scenario is accepted instead of rejected | The shared pool was already used by earlier tries. Start fresh with `docker compose down -v` then `docker compose up -d`, and run the steps in order. |
| A page asks for a credential again | Credentials live only in the current tab; reconnect with the **Credentials** button. |
| "Too many requests" | The AI Advisor allows 10 questions per minute; wait a minute. |
