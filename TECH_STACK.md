# Tech stack

What each piece is used for in the TagMyCredit app.

| Technology | Used for |
|---|---|
| **Next.js 16 + React 19** (TypeScript) | All app pages: dashboard, tag a credit line, check a buyer, supply-chain map, CFO confirmation, ops review. Also handles the server side through server actions. |
| **Plain CSS with design tokens** | The website's look: teal, amber and off-white colours, fonts, cards, score gauge, traffic light. Includes dark mode and Arabic right-to-left layout. |
| **Google Fonts**: Schibsted Grotesk, Figtree, Noto Kufi Arabic | Headings, body text, Arabic text. |
| **Better Auth** | Login, sessions and passwords; two-factor login for ops staff. |
| **PostgreSQL 17** | All data: companies, TMC-IDs, credit lines, monthly reports, scores, alerts, audit log. Row-level security stops one company reading another's data. |
| **Drizzle ORM** | Typed database access and migrations. |
| **pg-boss** (job queue inside Postgres) | Background work: sending OTP texts and emails, deadlines (expiry, dispute windows), the monthly score release. |
| **`@tmc/domain`** (our own TypeScript package) | The product rules: TMC-ID format, score formula, 3-supplier privacy floor, credit-line lifecycle, OTP rules. |
| **Zod** | Checking every form and input. |
| **Vitest** | Unit and integration tests. |
| **Playwright** | End-to-end tests that click through the app in a real browser. |
| **Unifonic** (SMS) / SMTP (email) | Sending real messages in production. Locally, a "dev outbox" page shows every message instead. |

Planned production hosting: Google Cloud, Dammam region (Cloud Run + Cloud SQL), so data stays in Saudi Arabia.
