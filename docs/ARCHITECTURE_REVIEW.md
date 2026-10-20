# Architecture review log

Status: `open` | `fixed` | `wontfix` | `lead` (needs lead decision). Severity: H (breaks security/deploy/correctness), M, L.

## Decisions needed from the lead
- **AR-01** Vercel request body limit (4.5 MB) < SPEC upload limit (5 MB). Options: (a) cap uploads at 4 MB on all deployments (change SPEC/S6), (b) keep 5 MB, accept that 4.5–5 MB uploads fail on the demo host only. Recommendation: (a), one constant in `@tmc/domain`.
- **AR-02** Vercel Cron runs at most once/day on Hobby; per-minute needs Pro. Options: Pro plan; or Hobby with daily cron + ops "Run tick" button for the demo. Recommendation: Pro for the demo account (deadlines/CFO activation look live).

- **AR-18** Score rounding vs caps (Testing T1 in HANDOFF): recommend round-then-cap.

## Findings

| ID | Sev | Area | Where | Finding | Fix / owner | Status |
|---|---|---|---|---|---|---|
| AR-01 | M | Deploy | SPEC §6/S6, next.config.ts | Vercel body limit 4.5 MB vs 5 MB uploads | Lead decision | lead |
| AR-02 | M | Deploy | vercel.json (missing) | Per-minute cron needs Vercel Pro | Lead decision | lead |
| AR-03 | H | Structure | tick placement | Worker can't import `apps/web/src/server` (`@/` aliases, `server-only` throws under node). Tick/release/messaging/clock must live in `@tmc/db/jobs` | Backend | open |
| AR-04 | H | Concurrency | tick | Concurrent tick runs (cron + worker + ops) need `pg_try_advisory_lock` | Backend | open |
| AR-05 | H | RLS | 0001_rls.sql column grants | `select()`/`findMany` without explicit columns on `buyer_scores`/`attachments`/`"user"` inside withTenant ⇒ permission denied | Backend: explicit columns | open |
| AR-06 | H | RLS | 0001_rls.sql companies policy | `getScoreCard(id)` for a non-counterparty can't read company name under RLS; needs SECURITY DEFINER `company_directory(id)` (migration 0002) | Backend | open |
| AR-07 | H | Race | requestOtp / confirmVersion | Send-rate count and attempt counter need row locks / atomic conditional UPDATE; confirm must be one tx | Backend | open |
| AR-08 | M | Race | CFO activation | End old ACTIVE before activating new in same tx (partial unique index) | Backend | open |
| AR-09 | H | Time | periods/due/release | Business dates must use Riyadh calendar (UTC+3); single helper in domain | Backend: `packages/domain/src/time.ts` added (riyadhDate, periodOf, snapshotDueAt, releaseAt). Usage in services to verify | open (helper done) |
| AR-10 | M | Money | SAR→halalas | Parse from string, ≤ 2 decimals; no float multiply | Backend: `domain/src/money.ts` parseSar is string-based | fixed |
| AR-11 | M | Security | /api/cron/tick | Use `Authorization: Bearer $CRON_SECRET`, constant-time compare, Node runtime, force-dynamic | Backend | open |
| AR-12 | M | Deploy | db/src/index.ts pool | Pool max 10 per serverless instance exhausts hosted Postgres; set `DATABASE_POOL_MAX=3` + pooled URL on Vercel | Lead/deploy config | open |
| AR-13 | M | Auth | OTP re-auth | Use `session.createdAt` for "signed in within 30 min"; `nextCookies()` plugin for server-action sign-in | Backend | open |
| AR-14 | L | RLS | buyer_scores policy `USING (true)` | Unverified viewers can read published scores at DB level; app enforces VERIFIED. Acceptable for MVP | — | open |
| AR-15 | L | Perf | schema | No plain index on `disputes(line_id)`, `closure_requests(line_id)`; fine at demo scale | — | wontfix (MVP) |
| AR-16 | M | Deploy | migrations | `migrate` runs via `tsx` (root devDependency). Docker/Cloud Run image must include it or migrations must be compiled | Backend/lead | open |
| AR-17 | M | Perf | apps/web/src/i18n/core.ts:1-12 | core imports en+ar dictionaries; client.tsx/MoreMenu import core ⇒ both dictionaries in every client bundle (~100 KB raw) | Frontend: constants module + pass current-locale messages to provider | open |
| AR-18 | L | Spec | SPEC §5 caps vs rounding (Testing T1) | raw→cap→round lifts capped scores one band (499→500 FAIR). Architect recommends: round first, then apply caps (scores 499/399/599/699 exactly) | Lead decision | lead |
