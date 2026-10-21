# Handoff notes

Each agent writes under its own heading.

## Frontend

### App routes (backend: please build `TaskView.href` / `NotificationView.href` with these)
| Route | Screen |
|---|---|
| `/` | Landing (public) |
| `/sign-in`, `/register`, `/demo` | Public auth + demo persona picker |
| `/home` | Home (staff without a company are redirected to `/ops`) |
| `/credit-given`, `/credit-received` | Supplier / buyer books (`?status=ACTIVE&q=…`) |
| `/lines/new` | New credit line (`?q=<TMC-ID or CR>` pre-fills the lookup) |
| `/lines/{lineId}` | Line detail (versions, snapshots, disputes, closures, defaults, actions) |
| `/lines/{lineId}/confirm` | CFO confirmation of the line's PENDING version (new line or amendment) |
| `/snapshots` | Monthly snapshot worklist + CSV upload |
| `/check` | Check a buyer (lookup) — `/check/{companyId}` shows the score card |
| `/projects`, `/projects/{projectId}` | Projects list, project map + editor |
| `/alerts` | Notifications |
| `/company` | Company profile, TMC-ID anatomy, team, CFO |
| `/ops` | Ops console (`?tab=verification|cfos|disputes|defaults|release|audit|void`) |
| `/dev/outbox` | Dev outbox (demo mode only) |

Suggested task hrefs: `CONFIRM_LINE`/`CONFIRM_AMENDMENT` → `/lines/{id}/confirm`; `SNAPSHOT_DUE` → `/snapshots`; `RESPOND_DISPUTE`/`RESPOND_CLOSURE`/`REPLY_DEFAULT` → `/lines/{id}`; `NOMINATE_CFO`/`AWAIT_VERIFICATION`/`AWAIT_CFO_APPROVAL` → `/company`.

Cookies read by the frontend: `tmc_locale` (`en`|`ar`, set by `setLocale`; the UI also writes it client-side before calling the action) and `tmc_theme` (`light`|`dark`, absent = system; UI-only).

### Frontend → for Mobile
Frontend is building these shared primitives (please extend/wrap them rather than duplicating):
- `components/ui/Dialog.tsx` — native `<dialog class="dlg">` with `showModal()`, title/description, close button, Esc/backdrop close, focus return. Styles in `styles/globals.css` (`dialog.dlg`, `.dlg-head`, `.dlg-body`). Ideal place to turn into a bottom sheet on phones (e.g. `@media (max-width:640px){dialog.dlg{…}}` in `mobile.css`).
- `components/ui/Table.tsx` — `<div class="tbl-wrap"><table class="tbl">`; rows may carry `data-label` on `<td>` so mobile.css can switch to cards.
- `components/shell/AppShell.tsx` — teal header band (`.app-header`), desktop nav (`.app-nav`), mobile menu (`.mnav`) toggled by a `menu-btn` below 960px. Nav items are exported from `components/shell/nav.ts` (`navItems(session)`) so a bottom tab bar can reuse the same list.
- Toasts (`components/ui/Toast.tsx`, `.toasts`) anchored bottom inline-end, respects safe-area.
I'll import mobile primitives into the shell/dialogs once they are documented here.

## Testing

Test databases: `@tmc/db` tests use `tmc_test`; `@tmc/web` integration tests use `tmc_test_web` (created + truncated automatically each run) so ticks/releases never collide. The demo DB `tmc` is only touched by e2e.

### Testing → bugs
| # | Status | Where | Repro | Expected | Actual | Failing test |
|---|---|---|---|---|---|---|
| T1 | IMPLEMENTATION OK — SPEC wording open (lead) | `docs/SPEC.md` §5 "raw → caps → rounded to nearest 10" | Perfect payer with one unpaid upheld default: raw 1000 → cap 499 → round → **500** | Capped scores stay in the band below the cap (499/399 POOR, 599 POOR, 699 FAIR) | Literal order gives 500 (FAIR), 600 (FAIR), 700 (GOOD), 400 — each cap lands one band too high | `packages/domain/test/score.test.ts` asserts `score ≤ cap` + band. Suggest: round first, then apply caps (scores 499/599/699/399), or round caps down (490/590/690/390). |
| T2 | OPEN (backend, low) | `packages/domain/src/money.ts` `parseSar` | `parseSar("١٢٬٥٠٠")` (Arabic keyboard digits; the function already strips `٬`) | 1,250,000 halalas | `null` → Arabic users typing amounts with Arabic-Indic digits get "invalid amount". Map `٠-٩`/`۰-۹` → `0-9` and `٫` → `.` before parsing | `packages/domain/test/money.test.ts` "accepts Arabic-Indic digits" |
| T3 | OPEN (backend, medium) | `packages/domain/src/ids.ts` `tmcCheckChar` | `isTmcId("TMC-SA-1234-3456-41-I")` where the real id is `…-01-I` | Any single-digit typo invalidates the check char (the code comment claims so) | Accepted: weights `i+1` that share a factor with 36 (4, 6, 8, 9) make deltas of 4/6/9 vanish mod 36. Use ISO 7064 MOD 37,36 or weights coprime to 36 (e.g. 1,5,7,11,13,17,19,23,25,29) | `packages/domain/test/ids.test.ts` "rejects every single-digit tampering" |

## Mobile → for Frontend
Full guidelines: `docs/MOBILE.md`. Primitives: `@/components/mobile` — `MobileTabBar`, `MoreMenu`, `MobileHeader`, `BottomSheet`, `ResponsiveTable`, `ScrollRow`, `StickyActionBar`, `MobileIcon`, `LogoMark`. All text comes in through props (pass `t(...)`).

1. **CSS order** in `app/layout.tsx`: `import "@/styles/tokens.css"; import "@/styles/globals.css"; import "@/styles/mobile.css";`
2. **Root layout metadata and viewport** (paste):
```ts
import type { Metadata, Viewport } from "next";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",               // enables env(safe-area-inset-*)
  interactiveWidget: "resizes-visual", // keyboard overlays; svh layouts don't jump
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B3D3A" },
    { media: "(prefers-color-scheme: dark)", color: "#0E2C2A" },
  ],
  // do NOT set maximumScale/userScalable (zoom is an accessibility requirement)
};
export const metadata: Metadata = {
  applicationName: "TagMyCredit",
  appleWebApp: { capable: true, title: "TagMyCredit", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false }, // stop iOS auto-linking CR/IDs/amounts
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-32.png", sizes: "32x32" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};
```
`app/manifest.ts` already exists (mine, static). If a `tmc_theme` cookie forces a theme, you may switch to `generateViewport` and return a single `themeColor` (teal in both cases, so the static list above is fine).
3. **Signed-in app shell** (`(app)/layout.tsx`): keep the desktop header and nav for ≥ 1024 px (wrap the nav in `.d-only`), and on phones render no global sticky header — each page's `MobileHeader` is the sticky bar. Render once, after `<main>`:
```tsx
<MobileTabBar
  ariaLabel={t("nav.main")}
  items={[
    { href: "/home", label: t("nav.home"), icon: "home", badge: openTasks },
    { href: "/credit-given", label: t("nav.given"), icon: "given", match: [] },
    { href: "/credit-received", label: t("nav.received"), icon: "received" },
    { href: "/check", label: t("nav.check"), icon: "check" },
  ]}
  more={{
    label: t("nav.more"), badge: unreadAlerts,
    items: [ { href: "/snapshots", label: …, icon: "snapshots" }, { href: "/projects", …, icon: "projects" },
             { href: "/alerts", …, icon: "alerts", badge: unreadAlerts }, { href: "/company", …, icon: "company" },
             /* staff: */ { href: "/ops", …, icon: "ops" }, /* demo: */ { href: "/dev/outbox", …, icon: "outbox" } ],
    labels: { title, close, language, theme, themeLight, themeDark, themeSystem },
    locale, onLocaleChange: setLocale /* server action */, theme: await getTheme(),
    account: <><b>{user.name}</b><small>{company.legalName} · <span className="mono ltr">{company.tmcId}</span></small></>,
    signOut: <SignOutButton className="btn btn-line btn-block" />,
  }}
/>
```
Line pages (`/lines/*`) highlight Given or Received through `match` if you can tell the side; otherwise leave them unhighlighted.
4. **Every app page** starts with `<MobileHeader title={…} back={{ href: parent, label: t("common.back") }} actions={…} />`. It renders the `<h1>`. Put page content in `.wrap` or `.m-page`.
5. Use `BottomSheet` for all modals (it replaces raw `dialog.dlg` and matches it at ≥ 768 px), `ResponsiveTable` for all tables, `ScrollRow` + `.m-chip` for status filters and long `.tabs`, and `StickyActionBar` as the last child of long forms. Form attributes: MOBILE.md §5.
6. Don't wrap sticky elements in `overflow:hidden` (e.g. `.panel-flush`). Don't add `overflow-x:hidden` anywhere: mobile.css switches body to `clip` on purpose.

### Frontend — status (scope cut by lead)
**Built & wired to the contract:** `/` landing (demo-first CTA), `/sign-in` (Better Auth `signIn.email`), `/demo` persona picker (`demoSignIn`), app shell (teal header band, company name/TMC-ID/status, desktop nav, bell w/ unread, EN/AR + theme toggles, user menu/sign-out; `MobileTabBar` + `MoreMenu` from components/mobile below 1024 px; UNVERIFIED/SUSPENDED banner), `/home` (Needs you, alerts, book tiles, watchlist, own score), `/credit-given` + `/credit-received` (filters, `ResponsiveTable`), `/lines/new` (lookup → terms → live `.doc` preview → `createLine`), `/lines/[id]` (flags, counterparty score, every `LineDetail.actions` entry as a focused `BottomSheet` dialog: amend, close, snapshot w/ live bucket-sum + quarantine note reveal, file default, dispute (evidence required), closure request/response, decline, reply/retract/settle default; versions timeline; snapshots table w/ aging bar + "Held for review"; dispute/closure/default cases), `/lines/[id]/confirm` (CFO `.doc` card + consent → `requestOtp` → 6-box OTP w/ paste → `confirmVersion`; decline path), `/check` + `/check/[companyId]` (ScoreCard: gauge, band, light, exposure+supplier band, behaviour, confidence, alert box, 4 factor bars with reasons + 5th "Bad-debt history" row, frozen note, sparkline; privacy-floor empty state), `/projects` + `/projects/[id]` (SupplyChainMap: tiers, curved SVG links via ResizeObserver, hover/focus preview + click pin, detail panel, shared-supplier badge, cascade view w/ RED/YELLOW counts, phone tier list, payment arrows only without reduced motion), `/alerts` (list + mark all read), `/ops` (tabs: Companies, CFO approvals, Data quality → `decideSnapshot`, Score release run-now + tick + history), `/dev/outbox` (newest first, OTP codes one-click copy). error/loading/not-found states.
**Skipped (lead's cut):** `/register`, `/company` (team, invite, CFO nomination), `/snapshots` worklist + CSV upload, project editor, ops disputes/defaults/audit/void tabs. Links to these were removed from nav/landing; backend task hrefs pointing at `/company` or `/snapshots` will 404 until built.
**i18n:** `src/i18n/{constants,core,server,client,en,ar}.ts`. Client code imports cookie constants from `@/i18n/constants` (mobile agent: please switch `MoreMenu` from `@/i18n/core` to `@/i18n/constants`; core still re-exports them so nothing breaks). Dictionaries are server-only; the root layout passes the active locale's messages to `I18nProvider`. `t.dyn(key)` handles server keys and humanises unknown ones (dev console warns). `docs/I18N_KEYS.md` did not exist when I finished — reconcile `tasks.*`, `notifications.*`, `reasons.*`, `caps.*`, `errors.*` keys against it (I guessed names; see en.ts).
**Local formatter:** `src/components/format.ts` (money from halalas, dates in Asia/Riyadh, Latin digits + Gregorian in AR). Uses `@tmc/domain` constants (TERMS_DAYS, LIMIT_MIN/MAX_HALALAS, PRIVACY_FLOOR).
**Backend bug found:** `getOpsQueue` → `services/ops.ts:44` throws Postgres 42712 (duplicate table alias), so `/ops` and staff `/home` hit the error boundary.
**Verified:** typecheck clean for all frontend files (remaining tsc errors are in `src/server/queries.ts`); smoke-tested with dev server as Sara (home, books, line detail, check, project map, alerts, outbox), Omar (confirm page with Send-code), ops (blocked by the bug above), and AR locale (`<html lang="ar" dir="rtl">`). No visual pass at 375/1280 or dark mode, which was cut for budget.
