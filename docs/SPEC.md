# TagMyCredit MVP — product spec (source of truth)

Pilot: Saudi Arabia, SAR. Audience for this build: investor and customer demos, so it ships with rich fictional demo data and one-click demo personas.
Every rule here has a reason in `DECISIONS.md`.

## 1. People and companies
- **Company**: legal name (EN + optional AR), CR number (10 digits, unique), city, sector. Gets a **TMC-ID immediately** at registration; status `UNVERIFIED` → ops verifies → `VERIFIED` (or `SUSPENDED`).
  - UNVERIFIED companies can sign in, set up their team and CFO, but cannot create lines, be confirmed into the network, or see network scores.
- **TMC-ID format**: `TMC-SA-AAAA-BBBB-NN-K` — `AAAA` = 4 random digits, `BBBB` = last 4 digits of CR, `NN` = sequence 01–99 for collisions, `K` = check character (mod-36 over the digits, alphabet `0-9A-Z`). Not reversible to identity (random part).
- **Credit line ID**: `TCL-SA-NNNNNNN` (7-digit sequence).
- **Member roles**: `OWNER`, `ADMIN`, `CREDIT_MANAGER`, `VIEWER`. One user belongs to exactly one company.
  - Create/amend/close lines, submit snapshots, file defaults, respond to disputes/closure requests: OWNER, ADMIN, CREDIT_MANAGER.
  - Manage team and nominate CFO: OWNER, ADMIN.
  - VIEWER: read-only.
- **CFO**: exactly one active CFO per company (a designation on a member). Only the active CFO can confirm/decline lines and amendments (as buyer), raise disputes, request closure, reply to default reports.
  - Nomination by OWNER/ADMIN: member, Saudi mobile (+9665XXXXXXXX), title, authority document (upload).
  - Ops approves → **48 h cooling-off** → ACTIVE (ops may waive cooling-off for a documented emergency). Previous CFO's authority ends when the new one becomes ACTIVE; old CFO notified.
  - On CFO change, pending confirmations are re-issued to the new CFO (fresh OTP needed).
- **Ops staff**: platform users flagged as staff. They verify companies, approve CFOs, decide disputes and default reports, void lines, run the score release.

## 2. Credit-line lifecycle
Line status: `PENDING` → `ACTIVE` | `DECLINED` | `EXPIRED`; `ACTIVE` → `CLOSED` | `VOIDED`. Any state → `VOIDED` (ops, fraud/error).
Lines carry **versions** (limit, terms, effective date). Version status: `PENDING`, `CONFIRMED`, `DECLINED`, `EXPIRED`, `SUPERSEDED`.

| Transition | Who | Rule |
|---|---|---|
| Create line (v1 PENDING) | Supplier OWNER/ADMIN/CREDIT_MANAGER, both companies VERIFIED, buyer has ACTIVE CFO | Buyer found by exact TMC-ID or exact CR only. Limit SAR 10,000–500,000,000; terms 30/45/60/90/120 days. One non-closed line per supplier–buyer pair. |
| Confirm (v → CONFIRMED, line ACTIVE) | Buyer CFO + SMS OTP | Within **14 days** else EXPIRED. |
| Decline | Buyer CFO (no OTP needed, reason optional) | Line DECLINED (v1) or amendment DECLINED (old version stays). |
| Amend (new version PENDING) | Supplier | Limit/terms/effective date changes. Old confirmed version stays in force until CFO confirms; 14-day expiry. Max one pending amendment. |
| Close | Supplier, any time, no buyer consent | Buyer notified. History keeps counting per score rules. Close reason required. |
| Closure request | Buyer CFO | Supplier must close or object within **14 days**; silence → auto-CLOSED. Objection → stays ACTIVE, ops can see it. |
| Auto-close | System | ACTIVE line with no snapshot for **90 days**. |
| Dispute | Buyer CFO, within **30 days** of a version confirmation or of a snapshot | Reason + **evidence attachment always required**. One open dispute per line. Supplier has **14 days** to respond; silence does **not** suspend anything — the dispute status becomes `ESCALATED` and goes to the top of the ops queue with a **10-day** decision target. Only ops may set the line `suspended` (excluded from calculations, not deleted) while reviewing. Ops decides: REJECTED (line stays) or UPHELD (line VOIDED). The line keeps counting while a dispute is open unless ops suspended it. A new dispute on a line whose previous dispute was rejected in the last 90 days must reference a snapshot submitted after that rejection. |
| Void | Ops only | Removed from all current and historical calculations from the next release. Reason required. |

No deletions anywhere: every change writes an audit event.

## 3. CFO OTP
- 6 digits, **10-minute** expiry, **5 attempts** per code, max **3 sends per hour** per line version. Stored hashed (HMAC-SHA256 with server secret).
- Bound to (line version, CFO user id, phone). Using it for anything else fails.
- CFO must have signed in within the last **30 minutes** to request a code (re-auth).
- 3 failed codes in a row on the same version → that version's confirmation is locked for 30 minutes.
- Before confirming, CFO sees: supplier legal name + TMC-ID, buyer legal name, TCL-ID, version, limit, terms, effective date, supplier attestation text, and the consent statement: "Confirming makes this line part of the anonymous network data used to score your company. Other suppliers never see this supplier's name or amount."

## 4. Monthly snapshot (supplier reports per ACTIVE line)
For month M (period = first day of M), due by the 10th of M+1:
`outstanding`, `not_due`, `d1_30`, `d31_60`, `d61_90`, `d90_plus` (all SAR, ≥ 0), `settled_total`, `settled_on_time` (SAR settled during M, and the part paid on or before due date).
Validation: `not_due + d1_30 + d31_60 + d61_90 + d90_plus = outstanding`; `settled_on_time ≤ settled_total`; period not in the future; period ≥ line's first confirmed effective month; one snapshot per line per period (resubmission before release replaces it, audited).
**Data-quality quarantine** (supplier data drives buyer scores, so adverse jumps need a reason): a snapshot is `quarantined` (stored, visible to both parties, excluded from scoring) when either rule fires — `OVERDUE_JUMP`: share of outstanding that is 31+ days late rises by more than 40 percentage points versus the line's previous snapshot; `OVER_LIMIT`: outstanding > 150 % of the confirmed limit. The supplier must add a note explaining it; ops then **releases** it (counts from the next release) or **rejects** it (never counts). Suppliers with 3+ rejected snapshots in 12 months are flagged to ops.
Entry: per-line form, or CSV upload for many lines (`tcl_id,period,outstanding,not_due,d1_30,d31_60,d61_90,d90_plus,settled_total,settled_on_time`).

## 5. Score (released monthly on the 15th; ops can run it now)
**Timing**: the release run on the 15th of month M+1 scores **period M** (e.g. run 15 Oct → period September). "Run now" scores the most recent completed month. Only snapshots with period ≤ M that are not quarantined/rejected are used.
**Line's latest snapshot** = its period-M snapshot, else its period M−1 snapshot (carried forward); a line with neither is not current. All "latest" values below use this per line.
**Eligible supplier** for a buyer: has a line to the buyer that is ACTIVE or was CLOSED within the last 12 months, not VOIDED, not suspended, with a current latest snapshot (M or M−1).
**Privacy floor**: fewer than **3** eligible distinct suppliers → everything suppressed ("Not enough network data"): no score, light, behaviour, exposure, counts or alerts.

Lookback: last 12 periods (M back to M−11). Recency weight `w = 0.85^age` (age 0 = M). Aggregate across eligible lines per period.

| Factor | Weight | Sub-score (0–100) |
|---|---|---|
| Payment discipline | 45 | `Q_p = settled_on_time / settled_total` per period (skip periods with settled_total = 0). Factor = 100 × Σw·Q / Σw. |
| Current delinquency | 20 | Latest snapshots: `share = (0.25·d1_30 + 0.5·d31_60 + 0.8·d61_90 + 1.0·d90_plus) / outstanding` (0 if outstanding = 0). Factor = 100 × (1 − min(1, share / 0.5)) — nothing late → 100, weighted share ≥ 50 % → 0. |
| Utilization | 20 | Latest period: `U = Σ outstanding / Σ confirmed limit` of eligible lines. Factor = 100 if U ≤ 0.5; linear to 0 at U ≥ 1.0. |
| Exposure trend | 15 | `R = avg outstanding (M, M−1, M−2) / avg outstanding (M−3, M−4, M−5)`. Factor = 100 if R ≤ 1; `max(0, 100 × (2 − R))` otherwise. Needs ≥ 1 period in each window, else factor excluded. |

Missing factor → excluded and remaining weights re-normalised. Payment discipline missing too → suppressed (reason: no payment data).
`raw = 300 + 7 × weighted_factor` → caps → **rounded to nearest 10** → clamp 300–1000.

**Caps** (lowest applies), only **UPHELD** default reports count:
- Unpaid upheld default (not settled): **499**.
- Two or more upheld defaults in the last 24 months: **399**.
- Any upheld default in last 24 months (settled): **699**.
- More than 25 % of latest outstanding is 90+ days late: **599**.

**Bands**: POOR < 600, FAIR 600–699, GOOD 700–799, EXCELLENT ≥ 800.
**Traffic light** (`P` = payment discipline factor, `U` utilization):
- RED: unpaid upheld default, or U > 0.85, or P < 60.
- YELLOW: U ≥ 0.60, or P < 80, or any upheld default in last 12 months.
- GREEN: otherwise.
**Payment behaviour**: weighted on-time ratio ≥ 90 % High, 70–89 % Medium, < 70 % Low.
**Exposure band** (Σ latest outstanding): `<50K`, `50K–100K`, `100K–250K`, `250K–500K`, `500K–1M`, `1M–2.5M`, `2.5M–5M`, `5M–10M`, `10M+` (SAR). **Supplier band**: `3–4`, `5–10`, `11–20`, `21+`.
**Confidence**: HIGH ≥ 5 eligible suppliers and ≥ 6 periods of history; MEDIUM ≥ 3 suppliers and ≥ 3 periods; LOW otherwise.
**Anti-differencing (cohort freeze)**: if this release's eligible supplier set differs from the previous release's set and the previous release was published, republish the previous values marked `frozen` for this release; publish new values next release. Floor breach always suppresses immediately.
**How the UI presents the model**: four weighted factors plus **"Bad-debt history"** (the default caps, shown as a fifth row: "No reviewed defaults" or the cap applied). Financial strength (on the website) is deferred until financial-statement data exists; the product never claims it.
**Explainability**: each published score stores the four factor values, weights used, caps applied, and plain-language reasons (e.g. "Utilization 72 % — above the 60 % caution line").

## 6. Default reports and network alerts
- Filed by supplier on an ACTIVE or CLOSED (not voided) line whose latest snapshot has `d90_plus > 0`. Requires amount (≤ latest d90_plus), oldest unpaid due date, evidence attachment(s) and a note.
- Buyer CFO notified, may reply within **10 days**. Report is invisible to the network and does not affect score while UNDER_REVIEW.
- Ops: UPHOLD, REJECT, or REQUEST INFO (back to supplier). Supplier may RETRACT before decision.
- UPHELD → network alert to every company holding an ACTIVE line to that buyer (except the filer, who gets a confirmation) — **only if the buyer meets the privacy floor**; otherwise the filer is told no alert was sent. Alert text never names the filer or amount: "A reviewed default was reported for {buyer}. Reassess your exposure."
- Supplier marks SETTLED (ops confirms) → correction alert to the same recipients; unpaid cap lifts at next release; the 24-month caps remain.

## 7. Supply-chain projects (website's NEOM map, made real)
- Any VERIFIED company creates a project (name, location) and adds participants by TMC-ID into tiers 0–3 (0 = owner, 1 = main contractors, 2 = subcontractors, 3 = material suppliers) and payer → payee links.
- Each node shows the company's latest published band + light + score (or grey "Not enough data"). Exposure amounts are never shown on the map.
- Interaction as on the website: hover/focus previews, click pins, detail panel. **Cascade view**: select a node → highlight every downstream company reachable through links, with counts of RED/YELLOW nodes ("If X pays late, 6 companies below it are exposed; 2 are already RED"). Shared suppliers (2+ payers) badged as concentration risk.
- Phone layout: tier list (same data).

## 8. Screens
- **Public**: landing (short, links to website story), sign in, register company (3 steps → TMC-ID shown), demo persona picker (local/demo mode only).
- **App** (signed in): Home ("Needs you" tasks + alerts + summary), Credit given (supplier book), Credit received (buyer book), Line detail (versions timeline, snapshots, disputes, actions), New line, Snapshots (monthly reporting + CSV), Check a buyer (score card), Projects + map, Alerts, Company (profile, TMC-ID anatomy, team, CFO), CFO confirmations.
- **Ops console**: verification queue (companies, CFOs), disputes, default reports, voids, score release (run now + history), audit log viewer, dev outbox (local).
- Language toggle EN/AR (RTL), theme toggle light/dark, responsive to 360 px.
