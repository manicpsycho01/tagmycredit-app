# TagMyCredit — MVP

Trade-credit intelligence for Saudi suppliers: **Tag → Score → Protect**.
Suppliers tag the credit they give, the buyer's CFO confirms by SMS code, and the network turns everyone's monthly reports into an anonymous 300–1000 risk score, a traffic light, exposure ranges and default alerts. Nothing about a buyer is shown until at least 3 suppliers report on it.

- What it does and why: `docs/SPEC.md` (rules) · `DECISIONS.md` (every decision + reason) · `TECH_STACK.md` (what's used where)

## Run it locally (about 2 minutes)

Needs Node 22+, pnpm (`corepack enable`), and Homebrew PostgreSQL 17 (`brew install postgresql@17`).

```bash
pnpm install
cp .env.example .env            # then put long random strings in the three secrets
pnpm db:start                   # local Postgres on port 54329 (data in .pgdata/)
pnpm db:reset                   # create tables + load the demo data
pnpm --filter @tmc/web build && pnpm --filter @tmc/web start   # http://localhost:3000
pnpm --filter @tmc/worker start # optional: runs deadlines/releases every minute
```

Open **http://localhost:3000** and press **Try the demo**. `pnpm db:reset` puts the demo back to its starting state at any time.

## Demo personas (password for all: `TagMyCredit-Demo-2026`)

| Sign in as | Company | What to show |
|---|---|---|
| `sara@alnoor.demo` — Credit manager | Al Noor Building Materials (supplier) | Home tasks, watchlist, the network alert about Barq, credit given, tag a new line, monthly snapshots, the **Red Sea Coastal Resort** supply-chain map |
| `omar@qimma.demo` — CFO | Qimma Contracting (EXCELLENT, green) | Confirm a pending credit line with the SMS code (read the code in **Dev outbox**) |
| `layla@wadi.demo` — CFO | Wadi Hanifa Builders (FAIR, yellow) | Dispute, closure request, reply to a default report |
| `faisal@barq.demo` — CFO | Barq MEP Contractors (POOR, red, capped at 499) | What a defaulted company's score looks like |
| `huda@zahra.demo` — Owner | Zahra Facilities Co. (2 suppliers only) | "Not enough network data" — the 3-supplier privacy floor |
| `khalid@murjan.demo` — Owner | Murjan Construction (unverified) | Just registered; waiting for verification |
| `ops@tagmycredit.demo` — TMC Operations | — | Verify companies, approve CFOs, decide disputes and defaults, data-quality review, run the score release |

**Suggested 5-minute pitch path:** Try the demo → Sara → home (tasks + alert) → Check a buyer → Barq (red, alert) vs Qimma (green) vs Zahra (privacy floor) → Projects → map (tap a company, cascade view) → Tag a credit line → sign out → Omar → confirm with the code from Dev outbox → Ops → run the score release.

## Tests

```bash
pnpm test                       # 271 unit + database/privacy tests (domain rules, RLS isolation, constraints)
pnpm --filter @tmc/web build && pnpm --filter @tmc/web start &
pnpm db:reset && E2E_BASE_URL=http://localhost:3000 pnpm e2e   # browser smoke: desktop 1280 px + phone 390 px
```

The browser smoke signs in many times in a few seconds; Better Auth's sign-in rate limit can make one run flaky — run with `--retries=1`.

## Deploy

### A. Investor demo — Vercel + hosted Postgres (fictional data only)
1. Create a Postgres database (Neon or Supabase; the Vercel Marketplace sets `DATABASE_URL` for you).
2. In Vercel: **Add New → Project**, import the code, set **Root Directory** to `apps/web`; Vercel detects Next.js (install command `pnpm install` at the repo root is automatic in a pnpm workspace).
3. Environment variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your https URL), `OTP_SECRET`, `CRON_SECRET`, `DEMO_MODE=true`, `MESSAGING_MODE=outbox`.
4. Load the schema and demo data once from your laptop: `DATABASE_URL=<hosted url> pnpm --filter @tmc/db migrate && DATABASE_URL=<hosted url> pnpm --filter @tmc/db seed`.
5. `apps/web/vercel.json` calls `/api/cron/tick` daily (Vercel sends the `CRON_SECRET` automatically; the free Hobby plan allows daily crons). On Pro you can make it hourly.

### B. Real customers — Google Cloud, Dammam (data stays in Saudi Arabia)
Cloud Run (web) + Cloud SQL Postgres 17 + Secret Manager + Cloud Scheduler (POST `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` every minute), all in `me-central2`. Set `DEMO_MODE=false`, `MESSAGING_MODE=live` with Unifonic (SMS) and SMTP credentials, and run migrations on deploy. Get Saudi PDPL advice before loading real customer data (see `DECISIONS.md`).

## Project layout

```
apps/web        Next.js app (pages, server actions, API routes)
apps/worker     local tick runner
apps/e2e        Playwright browser tests
packages/domain product rules (score, TMC-ID, OTP, lifecycle) — pure TypeScript
packages/db     schema, migrations (incl. row-level security), jobs, demo seed
docs/           spec, build notes, website reference
```
