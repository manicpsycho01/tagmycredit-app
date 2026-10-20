# TagMyCredit: a plain-English guide

*For someone who has never seen the site and doesn't work in finance or credit.*
*Source: https://tagmycredit.com/ as of 19 Oct 2026. The company is at proof-of-concept stage, with no live product yet.*

---

## 1. The one-paragraph version

Businesses often deliver goods to other businesses **now** and get paid **later**, usually 30–90 days later. That delay is a loan from the seller to the buyer, called **trade credit**. Banks and credit bureaus track normal loans and credit cards, but **nobody tracks trade credit**. So when a supplier decides whether to trust a buyer, it can't see that the same buyer already owes money to ten other suppliers and is paying them late.

**TagMyCredit wants to be the shared record that fills that gap.** Suppliers log ("tag") the credit they give to each buyer, the buyer confirms it, and the platform combines everyone's entries into a **risk score and warning alerts**. No company sees another company's private numbers. Its own one-line pitch is: *"Like a FICO score for B2B trade credit."*

The initial market is the **Gulf region (GCC)**, mainly **Saudi Arabia and the UAE**.

---

## 2. Background: the domain in 5 minutes

| Term | What it means |
|---|---|
| **B2B** | Business-to-business: one company selling to another, not to consumers. |
| **Trade credit** | Goods or services delivered now and paid for later. The seller is effectively lending to the buyer. |
| **Net 30 / Net 60 / Net 90** | Payment terms: the buyer has 30/60/90 days to pay after the invoice. |
| **Credit line** | The maximum amount a supplier lets a particular buyer owe at any one time, e.g. "up to AED 2.4M on Net 90". |
| **Supplier / Buyer** | Supplier = the one giving credit (gets paid later). Buyer = the one receiving credit (pays later). Most mid-size companies are both. |
| **Credit bureau** | An agency that records who owes what and whether they pay (Experian, or SIMAH in Saudi Arabia). Mostly covers bank loans and cards, **not** supplier-to-buyer credit. |
| **FICO score** | The well-known US consumer credit score. TagMyCredit compares itself to it. |
| **Default / bad debt** | When a buyer doesn't pay. Bad debt is money the supplier writes off as lost. |
| **Receivables / Payables** | Receivables = money owed **to** you. Payables = money **you** owe. |
| **Credit manager / CFO** | The people at a supplier who decide whom to give credit to and how much. **They are the main audience for this product.** |
| **Tier 0 / 1 / 2 / 3** | Layers in a supply chain. On a construction project: project owner (Tier 0) → main contractors (Tier 1) → subcontractors (Tier 2) → material suppliers (Tier 3). Money flows **down** the chain and risk flows **up**. |
| **Concentration risk** | When too much of your money depends on one buyer or one project. If that one fails, you're badly hurt. |
| **Cascade** | One late payment at the top of a chain causes late payments at every layer below it. |
| **GCC** | Gulf Cooperation Council: Saudi Arabia, UAE, Qatar, Oman, Bahrain, Kuwait. |
| **Vision 2030 / NEOM** | Saudi Arabia's national investment programme and one of its giant construction megaprojects. This is why construction supply chains in the region are huge right now. |

### Why this is a real problem
A supplier checking a new buyer today can usually verify only:
- that the buyer is a real, licensed company (trade license),
- references the buyer chooses to give,
- how the buyer has paid **this** supplier in the past.

What the supplier **can't** see is how much the buyer owes **everyone else** and whether it's falling behind with them. That missing view is the problem TagMyCredit is built around.

---

## 3. How the product would work

```
  SUPPLIER                          BUYER
  (gives credit)                    (gets credit)
      │                                 │
      │ 1. TAG: "We gave Buyer X        │
      │    AED 2.4M on Net 90"  ───────►│ 2. CONFIRM via one-time code (OTP)
      │                                 │
      └──────────────┬──────────────────┘
                     ▼
         TagMyCredit network ("Trust Vault")
         combines tags from all suppliers
                     │
                     ▼
     3. INTELLIGENCE back to every member:
        • Risk score for Buyer X (0–1000)
        • Rough total exposure ("$250K–$500K from 5–10 suppliers")
        • Payment behaviour (on time: high / medium / low)
        • Alerts ("a default was reported on this buyer")
```

**In three words:** Tag → Score → Protect (the site's own wording).

### Key product concepts
| Concept | Plain meaning |
|---|---|
| **TMC-ID** | A unique ID number every registered company gets, e.g. `TMC-OM-8397-4521-01-K` (prefix, country, fragment of tax ID, fragment of registration number, sequence, check digit). It works like a credit-reference number for a business, and the site says it is anonymous and can't be reversed into the company's identity. |
| **Tag / Tagged Credit Line** | One recorded credit relationship ("Supplier A lets Buyer B owe up to X on Net 90"). It gets its own ID (e.g. `TCL-AE-0847291`). |
| **Dual verification** | Both sides confirm the tag, so a supplier can't make up debts about a buyer. |
| **Trade Risk Score** | A 0–1000 score built from 8 factors. The page shows four of them: payment discipline, utilization (how much of its credit the buyer is using), bad-debt history and financial strength. It sorts companies into bands such as POOR / FAIR / GOOD / EXCELLENT. |
| **Capacity Traffic Light** | GREEN / YELLOW / RED: can this buyer safely take on more credit? |
| **Network Alerts** | Notifications sent to all suppliers of a buyer when someone reports that the buyer defaulted. |
| **AAI (Anonymous Aggregated Intelligence)** | The privacy model. You only ever see **combined, anonymous** information about a buyer, never which other suppliers are involved or their exact amounts. |
| **Trust Vault** | The site's name for the central data store: *"You deposit data into a trust vault. You receive intelligence in return."* |
| **Supply Chain map** | A diagram of every company on a project, by tier, colour-coded by risk, to spot cascades and concentration risk early. |

### What stays private (per the site)
**You see:** the buyer's score, its traffic light, a rough exposure range, its payment behaviour, alerts, and full detail on **your own** credit lines.
**Nobody sees:** exact receivables or payables, bank balances, other suppliers' names or amounts, internal financial statements, operating costs, or individual transactions.

### Why a company would join (the "give to get" deal)
You contribute your credit data, and in return you get a view of your buyers that you can't get anywhere else. The more suppliers join, the more useful it becomes for everyone. That's a **network effect**, and it's also why the early stage is hard: with few members, the scores have little data behind them.

---

## 4. Who it's for

| Audience | What they'd get |
|---|---|
| **Suppliers / distributors** (primary): steel, cement, building materials, FMCG distribution | Fewer bad debts, faster decisions on how much credit to give, early warning before a buyer collapses. |
| **CFOs and credit managers** | One screen showing their whole credit book, plus a score they can use to justify decisions. |
| **Buyers** (secondary) | A good score they can show to get better payment terms from new suppliers. *The site barely explains this side.* |
| **Large-project players** (construction, NEOM-type megaprojects) | Visibility across every tier of a project's supply chain. |
| **Government / banks / financiers** (later) | Listed among the "6 categories" of planned services, but not explained. |

---

## 5. The page, section by section

The page is one long scrolling page with 15 sections. Several of them have sub-steps you click through (shown as "1 / 3" and similar).

| # | Section | What it's saying | Notes |
|---|---|---|---|
| 1 | **Navigation** | How It Works, Sign Up, FAQ, Login, Contact, "Get TMC-ID" button | Contact jumps to the sign-up form. |
| 2 | **Hero** | *"Tag Credit. See Risk. Protect Revenue."* over a background video | Doesn't say in plain words what the product is. |
| 3 | **The Gap** (5 steps) | A story: **Ahmed**, a steel supplier in Muscat, gives a big contractor $400K of credit on 90 days. Every check passes and he rates it "LOW RISK", but he can't see the contractor's debts to others, and losses cascade. | Fictional example that sets up the problem. |
| 4 | **The Invisible Market** | *"Credit bureaus track bank loans. Not trade credit."* Claims **$11 trillion** of B2B trade credit a year goes untracked. | Sub-steps: Privacy Paradox, GCC Reality, Structural Solution. |
| 5 | **Tag** | **Fatima**, CFO of a Dubai distributor, tags an AED 2.4M credit line to a retail chain. The buyer confirms by OTP. Both are verified and both stay anonymous. | **The clearest explanation of the product on the page.** |
| 6 | **Supply Chain Intelligence** | A "NEOM-scale" project map: 14 companies, 4 tiers, 18 credit relationships. One government payment delay ripples through the whole chain. | Uses real company names (Aramco, Binladin, Petrofac…) with made-up scores. Labelled "Live Chain Map". |
| 7 | **Market Size** | GCC is "building $4.6 trillion" (Vision 2030 $3.3T + rest of GCC $1.3T), with $850B+ of annual trade credit and "no incumbent". | Aimed at investors more than customers. |
| 8 | **Paradigm Shift** | Before/after table: credit decisions in 3–7 days → under 5 minutes; bad debt 5–12% → 2–5%; alerts in under 30 seconds. | Claimed outcomes, not yet proven at PoC stage. |
| 9 | **Trust Vault** | Dashboard mock-up: "847 companies protected", "4,892 active tags", sample score 747 GOOD with its breakdown, and a buyer table. | Labelled "Live Dashboard", but the numbers are illustrative. |
| 10 | **Platform** | "28 services across 6 categories" (Credit Risk, Trust & Verification, Supply Chain, Government, Financial Intelligence, Ecosystem). Five are highlighted: Credit Tagger, Payment Intel, Risk Score Engine, Alert Engine, Receivables & Payables Center. | This is the vision, not what exists today. |
| 11 | **Privacy by Design** | What you see vs. what stays protected (see section 3 above). | Important for convincing CFOs to share data. |
| 12 | **Sign-up form** | "Join the network": company, name, work email, role. Promises a TMC-ID in 3 minutes, no credit card, "Free forever on Starter". | |
| 13 | **Your Identity** | Breaks down the TMC-ID format piece by piece. *"Like a FICO score for B2B trade credit."* | |
| 14 | **FAQ** | 8 questions: what it is, TMC-ID, AAI, who sees data, how the score works, countries, cost, setup time. | The answers only appear when clicked, so this guide doesn't include them. |
| 15 | **Final call to action + footer** | *"Stop guessing who you can trust."* Buttons: Register Your Company, Schedule a Demo. Footer calls it *"The world's first B2B Trade Credit Intelligence Network."* | Many footer links (Pricing, API, Blog…) go nowhere yet. |

---

## 6. Two worked examples from the site

**Ahmed (the problem):** Ahmed sells steel. A big contractor wants $400K of steel and 90 days to pay. Ahmed checks the contractor's license, references and his own payment history with them, and everything looks fine. What he can't see is that the contractor is already late paying several other suppliers because *its* client (the project owner) delayed payment. Ahmed ships, and the money doesn't arrive.

**Fatima (the solution):** Fatima is CFO of a distributor. She tags the AED 2.4M credit line she gives a retail chain. The retailer confirms it with a one-time code. Now the network knows about that debt, anonymously. If the retailer starts paying other suppliers late, its score drops and Fatima gets an alert *before* her own invoice is overdue.

---

## 7. Where things actually stand (important context)

- **It's a proof of concept.** There is no live product, real customer base or real network data yet.
- On the website, the **dashboards, stats (847 companies, 4,892 tags), "Live" labels, scores and before/after percentages are illustrative.** Ahmed and Fatima are fictional characters.
- The big market figures ($11T, $4.6T, $850B+) are **not cited**, and "world's first" / "no incumbent" are claims the site makes, not verified facts.
- The page mixes **two audiences**: **investors** (market size, moat, 28 services) and **customers** (suppliers deciding whether to join). That mix is the main reason the use case feels unclear on a first visit.

---

## 8. Glossary of the site's own branded terms

| Site term | Meaning |
|---|---|
| **TMC** | TagMyCredit. |
| **TMC-ID** | The company's unique ID in the network. |
| **TCL-…** | ID of one Tagged Credit Line. |
| **Tag** | Record a credit relationship. |
| **Trust Vault** | The central data store. |
| **AAI** | Anonymous Aggregated Intelligence: the "you only see totals, never details" privacy model. |
| **Trade Risk Score** | The 0–1000 company score. |
| **Capacity Traffic Light** | Green/yellow/red signal for how much more credit a buyer can safely take on. |
| **Network Alert** | A default warning broadcast to all of a buyer's suppliers. |
| **Starter** | The free tier mentioned on the sign-up form. Other tiers aren't described. |
