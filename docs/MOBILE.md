# Mobile guidelines (owner: Mobile agent)

Primitives: `apps/web/src/components/mobile/*` (barrel `@/components/mobile`). Styles: `apps/web/src/styles/mobile.css` (import **after** `tokens.css` and `globals.css`). Integration steps: `docs/HANDOFF.md` → "Mobile → for Frontend".

## 1. What the website gets wrong on phones (measured with Playwright at 360/390 px), and what the app does instead
| Website issue | App rule |
|---|---|
| `body{overflow-x:hidden}` hides overflow instead of preventing it, and turns `<body>` into a scroll container as soon as `<html>` gets `overflow:hidden` (sticky header jumps). | `body{overflow-x:clip}` (mobile.css) plus `min-width:0` on grid/flex children. `scrollWidth === innerWidth` must hold at every scroll position. |
| Mobile menu drops down inside the sticky header (header grows from 64 to 287 px), with no backdrop, no scroll lock and no focus trap. | Bottom **tab bar** + **More** bottom sheet (native `<dialog>`, focus trap, Esc, CSS scroll lock that keeps scroll position). |
| About 40 tap targets under 44 px: header button 94×40, menu button 40×40, score tabs 60×29, category chips 34 px tall, TMC-ID anatomy segments 30×38, footer links 15–18 px tall. | 44 px minimum on coarse pointers (mobile.css bumps `.btn-sm`, `.icon-btn`, `.tabs`, `.dlg-close`, checkboxes, radio cards). Chips are 36 px visually with a 44 px hit area. |
| Tables (`.tbl-wrap`, min-width 560/420) scroll sideways inside a 282–356 px box with no affordance; header text wraps ("NETWORK / RISK"). | `ResponsiveTable` turns into stacked cards below 640 px of container width. |
| Category filters wrap into 3 rows of chips. | `ScrollRow`: one row, scroll-snap, edge fades. |
| "Check a buyer": tapping a company changes the result about 580 px below, out of view. | On phones, show the result in place (navigate, or a sheet) — never off-screen. |
| 103 text nodes under 12 px; 24,000 px page at 360. | Body text ≥ 14 px (`.small` = .86rem is the floor for content; 11–12 px only for uppercase labels). Keep screens short: one job per screen. |
| `scroll-padding-top:72px` is fixed; the header height includes the safe area. | `scroll-padding` follows `--m-header-h + safe-area`, and the bottom accounts for the tab bar. |

## 2. Breakpoints and layout
- **360** (small phone, design minimum), **390** (reference phone), **430** (large phone), **768** (sheets become centred dialogs; 2-column forms allowed), **1024** (desktop: top nav and sidebar; tab bar and mobile header hidden).
- Media queries: `min-width: X` / `max-width: X-0.02` (e.g. `767.98px`). Prefer **container queries** for components (`.rt`, `.m-cq`) so a card behaves the same in a narrow desktop column.
- Gutter `--gutter: 16px` (24 px from 768), safe-area aware: use `.wrap` (globals) or `.m-page`.
- Spacing scale: `--sp-1..10` = 4, 8, 12, 16, 20, 24, 32, 40 px.
- Heights: `100svh` for layout (e.g. a centred sign-in card); `100dvh` only for overlays. Never use `100vh` alone.

## 3. Sticky stacking order and z-index
Top: `MobileHeader` (`--z-header` 40, `top:0`, height `--m-header-h` 56 px + safe-area top). An in-page sticky row under it (filters/tabs) uses `top: calc(var(--m-header-h) + var(--safe-top))` and `--z-sticky` 30.
Bottom: `MobileTabBar` (fixed, `--z-tabbar` 50, 60 px + safe-area bottom), then `StickyActionBar` (sticky, `bottom: var(--dock-offset)`, 30), then toasts (`--z-toast` 200, already lifted above the bar).
Dialogs/sheets use the top layer: no z-index. Never put sticky elements inside `overflow:auto/hidden` ancestors (that includes `.panel-flush`, which has `overflow:hidden`).
`--tabbar-space` and `--dock-offset` are set automatically when a `.m-tabbar` exists (CSS `:has`), so do not hard-code bottom padding.

## 4. Primitives — how to use them
- **MobileTabBar** (client): rendered once in the signed-in app shell. 4 items + More: Home, Given, Received, Check, More (Snapshots, Projects, Alerts, Company, CFO confirmations, Ops/Outbox when relevant). Hidden at ≥ 1024 px and while the keyboard is open.
- **MobileHeader** (server): first element of every app page's content. `back={{href,label}}` uses the explicit parent route. `actions` takes icon buttons (`.m-hbtn` / `.icon-btn`, with aria-label). Use the `teal` tone everywhere; Home uses `leading={<LogoMark/>}`. It renders the page `<h1>` (id `page-title`), so the page must not add another h1.
- **BottomSheet** (client): every modal (decline reason, close line, raise dispute, confirm destructive action, filters). Controlled `open/onClose`, `closeLabel` required, actions go in `footer` (primary last). `dismissible={false}` for forms with unsaved input. Use `size="full"` for long forms.
- **MoreMenu**: used by the tab bar; pass `onLocaleChange={setLocale}` (server action), `theme` from `getTheme()`, `signOut={<SignOutButton/>}`, and `account`.
- **ResponsiveTable** (server): all list tables (books, snapshots worklist, ops queues, audit log). Exactly one `primary` column; `rowHref` makes the whole card tappable; `card:"full"` for status/action cells, `"hide"` for columns that don't matter on a phone; `rowTone` gives the traffic-light stripe; `longList` for audit log/outbox.
- **ScrollRow** (client): status filter chips (`.m-chip` + `aria-current="page"` for links, or `aria-pressed` for buttons), `.tabs` on the line detail and ops pages, horizontal stat tiles. Use `bleed` when it sits directly in the page gutter.
- **StickyActionBar** (server): last child of long forms (new line, snapshot form, register, nominate CFO, CFO confirm). It must not be inside an `overflow:hidden` panel; pass `bleed="16px"` when it sits inside a 16 px-padded container.
- Utility classes: `.m-only` / `.d-only` (1024 px), `.phone-only` / `.no-phone` (768 px), `.m-hit` (expands a small control's hit area), `.m-list` + `.m-row` (tap-row lists), `.m-kv` (2 → 4 column key/values via container query), `.m-clip` (ellipsis), `.m-fill`.

## 5. Forms (phones)
| Field | Attributes |
|---|---|
| TMC-ID | `inputmode="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck={false} enterkeyhint="search"` (on lookup), `.input.mono`, `dir="ltr"`; normalise case and spaces on the server side. |
| CR number (10 digits) | `inputmode="numeric" pattern="[0-9]*" maxLength={10} autocomplete="off" enterkeyhint="next"`, `dir="ltr"` |
| Saudi mobile | Affix `+966` (`.input-affix`), then `type="tel" inputmode="tel" autocomplete="tel-national" placeholder="5X XXX XXXX" maxLength={9}`, `dir="ltr"` |
| Money (SAR) | `inputmode="decimal" autocomplete="off"` with a `SAR` affix, `dir="ltr"`, `.num`. Never `type="number"` (scroll-wheel changes and locale bugs). Halalas conversion happens at the form edge. |
| OTP | One input: `inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxLength={6} enterkeyhint="done"` (the 6 boxes are visual only). Paste and SMS autofill must work. |
| Email | `type="email" autocomplete="email" autocapitalize="off" spellcheck={false}` |
| Password | `autocomplete="current-password"` / `"new-password"` |
| Dates | `type="date"` (native picker), or `type="month"` for the snapshot period with a select fallback. |
| Every text field | `enterkeyhint` = `next` (more fields follow), or `go`/`send`/`done` on the last field. |
- Labels sit above fields, one column below 768 px (`.form-row` already collapses). Errors are shown under the field with `aria-describedby`, and focus moves to the first invalid field.
- Inputs are ≥ 16 px on touch devices (enforced in mobile.css) so iOS never zooms.
- In RTL, IDs, phone numbers, amounts and codes get `dir="ltr"` or `.ltr` (bidi isolation), otherwise "TMC-SA-…" reorders.

## 6. Performance and motion
- Client JS only in interactive leaves. No scroll listeners on the page (IntersectionObserver or CSS). `content-visibility:auto` only on long lists (`longList`, `.m-list[data-long]`).
- Animations use transform and opacity only, and respect `prefers-reduced-motion` (globals.css has a global kill switch).
- No service worker. The manifest is static; icons are in `/public/icons`.
