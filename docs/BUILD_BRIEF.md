# Build brief (for the frontend, backend and testing agents)

Read first: `docs/SPEC.md` (rules), `DECISIONS.md` (why), `apps/web/src/server/contracts.ts` (UI ↔ server contract), `packages/db/src/schema.ts` + `packages/db/migrations/0001_rls.sql` (data + privacy), `docs/reference/concept-4-gulf-merged.html` (the website whose design the app must reuse), `docs/reference/TagMyCredit_Explained.md` (product).

Goal: a polished, deployable MVP used to **pitch to investors and customers**. It must be simple, fast, responsive (360 px → desktop), clean, bilingual (EN/AR RTL), light/dark, accessible (keyboard, focus, contrast, reduced motion), and must visibly deliver every website promise: Tag → Score → Protect, TMC-ID in 3 minutes, dual verification (CFO OTP), anonymous aggregated intelligence (3-supplier floor), score + traffic light + exposure range + payment behaviour + alerts, supply-chain tier map.

## Ownership (do not edit files you don't own; if you need a change elsewhere, write it in `docs/HANDOFF.md` under your name)
| Agent | Owns |
|---|---|
| **Backend** | `packages/domain/src/**`, `packages/db/src/**` (except `schema.ts` — schema changes go through a new migration and a note in HANDOFF), `packages/db/migrations/**` (new files only), `apps/web/src/server/**` (replace the stubs in `queries.ts`/`actions.ts`, keep `contracts.ts` stable — additive changes only, logged in HANDOFF), `apps/web/src/app/api/**`, `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/proxy.ts` (Next 16 middleware), `apps/worker/**`, `docs/I18N_KEYS.md` |
| **Frontend** | `apps/web/src/app/**` (except `api/`), `apps/web/src/components/**`, `apps/web/src/styles/**`, `apps/web/src/i18n/**`, `apps/web/public/**` |
| **Testing** | every `test/` folder (`packages/*/test`, `apps/web/test`), `apps/e2e/**`, vitest configs, `docs/TEST_REPORT.md` |
| **Lead (Claude)** | `docs/SPEC.md`, `DECISIONS.md`, `TECH_STACK.md`, `README.md`, root config, `contracts.ts` arbitration |

## Conventions
- TypeScript strict. No `any` (except at untyped library edges, commented). Small modules, no duplicate logic: rules live once in `@tmc/domain`; services call them; UI never re-implements rules.
- Money: integer halalas everywhere; convert SAR↔halalas only at form edges (`@tmc/domain` exports helpers).
- DB: **reads for a company's pages go through `withTenant(companyId, tx => …)`** (RLS). Writes, ops, auth and jobs use `getDb()` after explicit authorisation checks. Keep round-trips minimal: one query with joins/aggregates per loader where reasonable, no N+1, no query inside loops, use `Promise.all` for independent reads, batch inserts. Every state change writes one `audit_events` row in the same transaction.
- All user-visible text from the server is an **i18n key** (+ params). Keys: `errors.*`, `tasks.*`, `notifications.*`, `reasons.*`, `caps.*`. Backend lists every key it emits in `docs/I18N_KEYS.md` with English text; frontend provides EN + AR for all of them.
- Time: never `new Date()` scattered — services take `now` from one helper (`@/server/clock`, overridable in tests via `TMC_NOW` env, ISO string) so demos/tests can run at a fixed time.
- Server actions validate input with Zod, check session/role/CFO/company status, return `ActionResult`, call `revalidatePath` for affected pages.
- Security: auth required on everything except `/`, `/sign-in`, `/register`, `/demo`, `/api/auth/*`, `/api/cron/tick` (secret header). Ops pages require staff. Attachments are served only via an authorised route. Demo sign-in + dev outbox only when `DEMO_MODE=true`.
- Env: see `.env.example`. Postgres runs via `pnpm db:start` (port 54329). Use `DATABASE_URL` from `.env`.

## Demo data (backend seeds; testing verifies; frontend shows)
Fictional Saudi companies only (DECISIONS A6). Seed is deterministic, idempotent (`pnpm db:reset` rebuilds), "now" = real current date, 15 months of snapshots ending last month, and score releases for the last 3 months so history sparkline exists and the latest release is **published** (no unintended cohort freeze). Demo password for every account: `TagMyCredit-Demo-2026`.

| Persona (email) | Company | Shows |
|---|---|---|
| `sara@alnoor.demo` — Sara Al-Harbi, Credit Manager | **Al Noor Building Materials** (supplier, Riyadh) | Supplier book with ~6 buyers across all bands; watchlist (YELLOW + RED buyers); a NETWORK_ALERT about Barq; snapshots due this month; a closure request to respond to; owns the project map |
| `omar@qimma.demo` — Omar Al-Qahtani, CFO | **Qimma Contracting** (buyer, GOOD/EXCELLENT, GREEN) | CFO confirmations: one new line PENDING + one amendment PENDING (OTP flow via dev outbox); own score card |
| `layla@wadi.demo` — Layla Al-Otaibi, CFO | **Wadi Hanifa Builders** (buyer, FAIR, YELLOW — utilization and exposure rising) | Raised a dispute (OPEN, supplier must respond), a closure request; reply to a default report under review |
| `faisal@barq.demo` — Faisal Al-Dosari, CFO | **Barq MEP Contractors** (buyer, POOR, RED, upheld unpaid default → cap 499) | How a defaulted company's card looks; alert sent to its suppliers |
| `huda@zahra.demo` — Huda Al-Shehri, Owner | **Zahra Facilities Co.** (only 2 suppliers) | "Not enough network data" (privacy floor) |
| `khalid@murjan.demo` — Khalid Al-Mutairi, Owner | **Murjan Construction** (UNVERIFIED, just registered) | TMC-ID issued, waiting for verification; CFO nomination pending |
| `ops@tagmycredit.demo` — Noura (TMC Operations) | staff | Verification queue (Murjan + its CFO), dispute, default report under review, score release, audit log, dev outbox |

Also: ≥ 4 other suppliers (e.g. Rawabi Steel Trading, Najd Cement Supply, Eastern Electrical Distribution, Hijaz FMCG Distribution, Sahil Industrial Supplies) so buyers clear the floor; one more buyer **Sadeem Retail Group** (EXCELLENT); and one fictional project **"Red Sea Coastal Resort — Phase 2"** owned by Al Noor with ~14 companies in 4 tiers (owner: "Coastal Development Authority", fictional) and ~18 payer→payee links, including 2 shared suppliers, mixing GREEN/YELLOW/RED/grey nodes — the product version of the website's NEOM map.

## Design (frontend)
Reuse the website's tokens and components verbatim where possible (copy CSS from `docs/reference/concept-4-gulf-merged.html`): colour tokens incl. dark mode, fonts (Schibsted Grotesk / Figtree / Noto Kufi Arabic via `next/font/google`), teal band header with the 8-point star pattern, amber buttons, `.panel` cards, `.band-chip`, `.light` traffic light, `.pb` payment bars, the semicircle **gauge**, `.doc` credit-line document card (use it for the CFO confirmation screen), `.tabs`, tables, form inputs, the **TMC-ID anatomy**, and the **interactive NEOM map** (tiers, SVG curved links, hover preview / click pin, detail panel, shared-supplier badge, phone tier list, moving payment arrows respecting reduced motion) for project maps. Plain CSS (CSS modules or one global stylesheet with tokens); no UI framework. Use logical properties (`margin-inline-start`) so Arabic RTL works.
