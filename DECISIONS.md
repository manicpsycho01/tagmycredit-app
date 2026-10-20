# Decisions log

Each entry: the decision, a one-line reason, and who agreed.
**Founder** = you · **C+X** = Claude and Codex agreed after debate · **Claude** = implementation choice made by Claude alone (not a major product decision).
Full rules: `docs/SPEC.md`.

## Founder decisions
| # | Decision | Reason |
|---|---|---|
| F1 | Privacy floor: nothing about a buyer is shown unless **3+ suppliers** contribute | Stops anyone working out a single supplier's numbers. |
| F2 | Only the buyer's **CFO** can confirm a credit line, by SMS OTP | One accountable signer per company. |
| F3 | Build locally; never push to GitHub; leave the website repo untouched | Founder instruction. |
| F4 | MVP is for **investor and customer demos**: rich fictional demo data and one-click demo personas | Pitch use. |

## Stack (C+X, from the stack debate)
| # | Decision | Reason |
|---|---|---|
| S1 | One TypeScript monorepo: Next.js app, a plain domain-rules package, a separate worker | One codebase for a solo founder; the rules stay testable and portable. |
| S2 | Better Auth, with its data in our own Postgres | Login without running an identity server; data stays in-region. |
| S3 | No queue service. One idempotent **tick** job handles deadlines, message sending and the monthly release; it runs every minute from a local worker, or from Vercel Cron / Cloud Scheduler when deployed. *(Claude: replaces the pg-boss choice so the app deploys unchanged on Vercel or Cloud Run.)* | Fewer moving parts; every job is safe to repeat. |
| S6 | Evidence files (≤ 5 MB PDF/PNG/JPG) stored in Postgres | Deploying needs no separate file storage. |
| S7 | Two deploy paths: **demo** = Vercel + hosted Postgres (fictional data only); **real customers** = Cloud Run + Cloud SQL in Dammam | Fast to show investors; compliant for real data. |
| S4 | Production target: Google Cloud Dammam (Cloud Run + Cloud SQL); Saudi-only pilot | Saudi data residency; containers keep it portable. |
| S5 | Keep the marketing page static; the product is a separate app | Rebuilding a working page adds no customer value. |

## Score policy (C+X, debated)
| # | Decision | Reason |
|---|---|---|
| P1 | Suppliers report a **monthly aging snapshot per line**, including SAR settled and SAR settled on time | Matches the aged-receivables report credit managers already keep; less sensitive than invoices; the on-time figure measures real payment behaviour. |
| P2 | Four factors: payment discipline 45 %, current delinquency 20 %, utilization 20 %, exposure trend 15 % | Few, explainable factors that cover how a buyer pays, how late it is now, how stretched it is, and whether borrowing is accelerating. |
| P3 | Score = 300 + 7 × factor score, rounded to 10; bands POOR <600, FAIR 600–699, GOOD 700–799, EXCELLENT 800+ | Matches the website's examples; rounding hides small changes that could identify one supplier. |
| P4 | Supplier reporting quality is **not** a factor in the buyer's score | It measures the supplier's behaviour, not the buyer's. Used only to flag suppliers with poor data. |
| P5 | Defaults act through **caps**, not a weighted factor: unpaid 499; two or more in 24 months 399; any in 24 months 699; over 25 % of outstanding 90+ days late 599 | Avoids counting defaults twice; one serious event must dominate the score. |
| P6 | Utilization is penalised only above 50 % | Normal use of credit isn't risky. |
| P7 | Only **ops-upheld** defaults count; unreviewed reports never move the score | Protects buyers from false or retaliatory reports. |
| P8 | Score released **monthly (15th)**; when the set of suppliers changes, the previous score is shown frozen for one cycle | Stops before/after comparison revealing a newly joined supplier's data. |
| P9 | Below the floor, show nothing: no score, light, ranges, counts or alerts | F1 applied to every output. |
| P10 | Confidence (High/Medium/Low) shown next to the score, based on supplier count and months of history | Honest about thin data, without penalising small companies. |
| P11 | Every score stores its factor values and plain-language reasons | Explainable to CFOs and to the company being scored. |

## Verification and revocation (C+X, debated)
| # | Decision | Reason |
|---|---|---|
| R1 | CFO is nominated with an authority document, approved by ops, then waits a **48 h cooling-off** period | Stops account takeover by a fake CFO. |
| R2 | OTP: 6 digits, 10 min, 5 attempts, 3 sends/hour, tied to one line version; recent sign-in required | GCC SMS can be slow; tying the code to the version stops replay. |
| R3 | Any change to limit, terms or date creates a new version that needs CFO OTP again; the old version stays in force meanwhile | The buyer only ever agrees to terms they've seen. |
| R4 | Supplier can **close** a line any time with no consent; history still counts | It's the supplier's credit to withdraw. |
| R5 | Buyer CFO can **request closure**; supplier must close or object within 14 days; silence closes it | Buyers aren't stuck with relationships that have ended. |
| R6 | Buyer can't delete a confirmed line, only **dispute** it (within 30 days). The line keeps counting while open; supplier silence for 14 days suspends it; ops decides (rejected → stays, upheld → voided) | Stops buyers erasing bad history, while giving them a real remedy. |
| R7 | 3 rejected disputes in 12 months → further disputes need evidence | Discourages buyers from disputing every unfavourable line. |
| R8 | Ops can **void** a fraudulent line; it's removed from all calculations, current and historical | Fake lines must not poison scores. |
| R9 | A line with no snapshot for 90 days closes automatically | Stale relationships stop affecting exposure. |
| R10 | Default reports need 90+ days overdue in the latest snapshot plus evidence; the buyer gets 10 days to reply; alerts never name the filer or amount | Fair process; keeps the reporter anonymous. |
| R11 | Alerts are sent only when the buyer meets the 3-supplier floor | With 2 suppliers, the recipient could work out who filed. |
| R12 | Pending confirmations are **re-issued** to a new CFO (a fresh OTP is still needed) | Equally safe, less friction than cancelling. |

## Product and architecture (Claude, reviewed by Codex)
| # | Decision | Reason |
|---|---|---|
| A1 | Companies, roles and CFO designation live in our tables, not Better Auth's organization plugin | They're product workflows with verification steps. |
| A2 | Find a buyer only by exact TMC-ID or CR number; no browsing or name search | Privacy: no fishing for who's in the network. |
| A3 | TMC-ID issued instantly at sign-up; the company is "unverified" until ops checks it | Keeps the website's "TMC-ID in 3 minutes" promise without letting unverified companies into the data. |
| A4 | Postgres row-level security: a company can only read lines it's party to | Privacy enforced in the database itself, not just the app. |
| A5 | Local "dev outbox" page shows every SMS and email | Demo and testing without an SMS contract. |
| A6 | Demo data uses fictional company names | The website used real names (Aramco etc.) with made-up scores, which is a defamation risk in a product. |
| A7 | Money stored as integer halalas | No floating-point rounding errors. |
| A8 | The supply-chain map uses real published scores; "cascade view" highlights who is exposed downstream | Keeps the website's map, built on real data instead of a scripted simulation. |
| A9 | One user belongs to one company | Simpler permissions for the MVP. |
| A10 | Arabic/English chosen by a cookie, with right-to-left layout | Saudi users; no URL clutter. |
