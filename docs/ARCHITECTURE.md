# TagMyCredit MVP — Architecture

Owner: principal architect. Rules here are binding for all agents; changes to product rules go through `docs/SPEC.md` / `DECISIONS.md` (lead). Review findings live in `docs/ARCHITECTURE_REVIEW.md`.

## 1. Module map and dependency rules

```
                    ┌────────────────────────────────────────────┐
                    │ @tmc/domain  (packages/domain)             │  pure TS: types, constants, rules,
                    │ no I/O, no env, no Date.now(), no db/next  │  score formula, TMC-ID, money/period helpers
                    └───────────────▲───────────────▲────────────┘
                                    │               │
             ┌──────────────────────┴───┐           │
             │ @tmc/db (packages/db)    │           │
             │ schema, getDb/withTenant │           │
             │ migrations, seed         │           │
             │ clock.ts, jobs/* (tick,  │           │
             │ release, messaging send) │           │
             └──────▲────────────▲──────┘           │
                    │            │                  │
   ┌────────────────┴───┐   ┌────┴─────────────────┴───────────────────────────┐
   │ apps/worker        │   │ apps/web                                         │
   │ setInterval →      │   │  src/server/** (server-only): queries, actions,  │
   │ runTick() from     │   │    services, authz, clock re-export              │
   │ @tmc/db/jobs       │   │  src/lib/auth.ts (Better Auth, server)           │
   └────────────────────┘   │  src/app/api/** (auth handler, cron, files)      │
                            │  src/app/**, src/components/** (UI)              │
                            └──────────────────────────────────────────────────┘
```

| Module | May import | Must not import |
|---|---|---|
| `@tmc/domain` | `zod` only | `@tmc/db`, `next`, `pg`, `process.env`, `node:*` I/O, wall clock |
| `@tmc/db` | `@tmc/domain`, drizzle, pg, better-auth (seed hashing), nodemailer (jobs/messaging) | `apps/*`, `next`, `server-only`, `@/…` aliases |
| `apps/worker` | `@tmc/db` (incl. `@tmc/db/jobs`), `@tmc/domain` | `apps/web` |
| `apps/web/src/server/**` | `@tmc/db`, `@tmc/domain`, `@/lib/auth`, `next/*` | UI components. Every file starts with `import "server-only"` (queries/services) or `"use server"` (actions) |
| UI (`app/**` except `api`, `components/**`) | `@/server/queries` (server components only), `@/server/actions`, `import type` from `@/server/contracts`, pure helpers from `@tmc/domain`, `@/i18n` | `@tmc/db`, `drizzle-orm`, `pg`, `@/lib/auth`, `@/server/services/*` |
| `"use client"` files | `@/server/actions`, `import type` contracts, pure `@tmc/domain`, `@/lib/auth-client` | loaders, anything server-only |

Rules live **once** in `@tmc/domain` (limits, terms, OTP constants, floor = 3, bands, lights, score, period/due dates, money parsing). Services call them; UI imports constants for display only and never re-derives a decision the server returned (e.g. `LineDetail.actions`).

Shared background code (tick, score release, message sending, clock) lives in `@tmc/db/jobs` so both the Next cron route and the worker run the *same* function. The web's `@/server/clock` re-exports `@tmc/db` clock (`now()` honours `TMC_NOW`).

## 2. Request flows

**Read (page render)**
```
GET /lines/123 ─► proxy.ts (cookie presence only, no DB) ─► layout: getSession() [React cache(): 1 query]
  ─► page (server component) ─► getLine(id)
        └─ withTenant(companyId, tx ⇒ 1–4 queries, Promise.all where independent)   ← RLS as tmc_app
  ─► map rows → contract DTO (money as halalas, ISO dates, i18n keys) ─► HTML stream
```
- Every company-data read runs inside `withTenant`. `getDb()` reads are allowed only for: session/membership lookup, staff/ops loaders, outbox, audit, jobs.
- Directory info for non-counterparties (score card, lookup) comes from SECURITY DEFINER functions (`lookup_company`, `company_directory`), never from `getDb()`.
- tmc_app has **column-level** grants on `buyer_scores`, `attachments`, `"user"`: always select explicit columns there.

**Write (form)**
```
<form action={serverAction}> ─► "use server" action
  1. zod.safeParse(input)            → { ok:false, error:"errors.validation", fieldErrors }
  2. requireSession() + authz         → role / isCfo / company VERIFIED / staff  (helpers in server/authz.ts)
  3. domain rule check (pure)         → errors.* key
  4. getDb().transaction(tx ⇒ {
        SELECT … FOR UPDATE on the aggregate row (line / version / challenge) when racing is possible
        writes …
        insert audit_events (same tx)
        insert notifications / outbox (same tx)   ← message *sending* happens in tick
     })
  5. revalidatePath(affected routes)  → return { ok:true, data }
```
- Unique-violation (23505) on partial unique indexes is mapped to a domain error key, not a 500.
- Actions never return raw DB errors or English text.

## 3. Privacy model

| Layer | Mechanism |
|---|---|
| Tenant isolation | RLS on every company table; `withTenant` = `SET LOCAL ROLE tmc_app` + `app.company_id` in one transaction. Owner connection bypasses RLS and is used only after explicit authz. |
| Network intelligence | Only `buyer_scores` aggregates cross tenants. Floor: < 3 eligible distinct suppliers ⇒ `published=false`, all value columns NULL. `cohort_hash` not granted to tmc_app. |
| Anti-differencing | Cohort freeze: if eligible-supplier set changed vs previous published release ⇒ copy previous values with `frozen=true`. Floor breach suppresses immediately. Score rounded to 10. |
| Alerts | NETWORK_ALERT payload = buyer name/TMC-ID only. Never filer company, user, amount, line id. Sent only if buyer meets the floor; filer gets a separate confirmation. |
| Lookup | Exact TMC-ID / CR only (`lookup_company`), no name search, no listing. |
| Files | Bytes never granted to tmc_app; served by `/api/files/[id]` after authz (party to the dispute/default line, own company, or staff). `Content-Disposition: attachment`, stored mime type, `nosniff`. |
| PII in logs | Never log OTP codes, phone numbers, emails, request bodies. Outbox body contains the OTP by necessity — outbox is staff/demo-only. |
| Unverified | UNVERIFIED companies: no lines, no scores (`getScoreCard` of others returns null). |

## 4. Jobs (tick)

`runTick(now)` in `@tmc/db/jobs`, idempotent, every step is a set-based UPDATE guarded by status + time, safe to re-run:
1. Acquire `pg_try_advisory_lock(hashtext('tmc:tick'))` on a dedicated client (or `_xact_` variant inside one tx); not acquired ⇒ return `{ skipped: 1 }`.
2. Expire versions/lines past `expires_at` (14 d); dispute supplier silence ⇒ `ESCALATED` (never auto-suspend; only ops suspends, SPEC R6); closure silence ⇒ AUTO_CLOSED; 90-day no-snapshot auto-close; CFO APPROVED with `effective_at ≤ now` ⇒ ACTIVE (end previous ACTIVE first, re-issue pending confirmations); each with audit + notifications.
3. Monthly release: if Riyadh date ≥ 15th and no `score_releases` row for previous month ⇒ run release (the `period` unique constraint makes double runs fail safe).
4. Send QUEUED outbox rows (`FOR UPDATE SKIP LOCKED`, batch ≤ 50) when `MESSAGING_MODE=live`; otherwise mark nothing (dev outbox shows them).
Triggers: local `apps/worker` (60 s interval), Vercel Cron / Cloud Scheduler → `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`, ops "run now" action. Each step should be a short transaction; tick must finish well under 60 s.

## 5. Time, money, i18n, errors

- **Clock**: one `now()` (`TMC_NOW` override). Store timestamps as `timestamptz` (UTC). Business calendar is **Asia/Riyadh (UTC+3, no DST)**: period of a date, "this month", snapshot due date (10th of M+1), release day (15th) all use `riyadhDate(now)` from `@tmc/domain`. `date` columns hold Riyadh calendar dates. Never use `new Date().getMonth()`/`toISOString().slice(0,10)` on a UTC instant for business dates.
- **Money**: integer halalas (`bigint` mode number; max 5×10^10 per line, sums safe < 2^53). Parse SAR strings → halalas in domain (`parseSar`, ≤ 2 decimals); format with `Intl.NumberFormat` in UI. Ratios computed in floats only inside the score formula; outputs rounded.
- **i18n keys**: server returns keys only. Namespaces `errors.*`, `tasks.*`, `notifications.*`, `reasons.*`, `caps.*`; camelCase leafs (`errors.otpExpired`, `reasons.utilizationHigh`); params are plain strings/numbers (money as halalas number + formatted by UI). Every emitted key listed in `docs/I18N_KEYS.md`; UI has EN+AR for each.
- **Errors**: expected failures ⇒ `ActionResult { ok:false, error:key }`. Unexpected ⇒ throw, caught by `error.tsx` (generic message, digest only). Loaders return `null` for not found / not visible (page calls `notFound()`), never leak existence.

## 6. Performance budgets

| Budget | Target |
|---|---|
| DB round-trips per loader | ≤ 6 (incl. withTenant's 2 `SET`s: aim ≤ 4 data queries) |
| N+1 | none: no query inside loops; batch with `inArray`/joins/aggregates |
| Pool | `DATABASE_POOL_MAX` = 10 local / Cloud Run, 3 on Vercel (pooled URL) |
| Rendering | server components by default; client components only for interaction |
| Client JS | no UI/chart libraries; gauge, sparkline, map as SVG; map is the only large client component |
| LCP | < 2.5 s on mid-range mobile (4G); fonts via `next/font` with `display: swap`, subset |
| proxy.ts | cookie check only, no DB call |

## 7. Configuration

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | web, worker, db | Vercel: pooled URL (pgBouncer transaction mode is fine — `SET LOCAL` is tx-scoped) |
| `DATABASE_POOL_MAX` | db | 3 on Vercel |
| `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` | web | URL = public origin of the deployment |
| `OTP_SECRET` | web | HMAC key for OTP hashes |
| `CRON_SECRET` | cron route | Vercel sends it as `Authorization: Bearer` automatically |
| `DEMO_MODE` | web | `true` only on the demo deployment |
| `MESSAGING_MODE`, `UNIFONIC_*`, `SMTP_URL`, `MAIL_FROM` | jobs | `outbox` on demo |
| `TMC_NOW` | clock | tests/demos only; never in prod |
| `PORT` | Cloud Run | `next start -p $PORT` |

Env is read in one place per package (`server/env.ts` with zod) and fails fast at boot.

## 8. Deployment topologies

```
DEMO (fictional data)                         PRODUCTION (real customers, KSA residency)
┌──────────── Vercel ───────────┐             ┌──────── GCP me-central2 (Dammam) ────────┐
│ Next.js (Node runtime)        │             │ Cloud Run service: web container         │
│  /api/cron/tick ◄─ Vercel Cron│             │   /api/cron/tick ◄─ Cloud Scheduler (1m) │
└──────────────┬────────────────┘             │ Cloud Run job: migrate (on each deploy)  │
               │ TLS, pooled                  └──────────────┬───────────────────────────┘
       Hosted Postgres 17                                    │ Cloud SQL connector / private IP
       (Neon / Supabase)                            Cloud SQL Postgres 17 (Dammam)
```
No worker process is deployed in either topology; the cron endpoint replaces it.

## 9. Deployment readiness checklist

(Filled in near the end of the build — see section 10.)

## 10. Status / what is missing

(Filled in near the end of the build.)
