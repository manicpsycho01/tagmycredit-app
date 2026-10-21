/**
 * Demo data (docs/BUILD_BRIEF.md): fictional Saudi companies, personas, 15 months of snapshots and the last three
 * score releases, computed by the real release code. Deterministic; skips if the demo data is already present.
 * Run: `pnpm --filter @tmc/db seed` (or `pnpm db:reset` to rebuild from scratch).
 */
import {
  addDays,
  addHours,
  addPeriods,
  buildTmcId,
  formatTclId,
  releaseAt,
  reportingPeriod,
  riyadhMidnight,
  scheduledReleasePeriod,
  type SnapshotInput,
} from "@tmc/domain";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { now as clockNow } from "./clock";
import {
  account,
  attachments,
  cfoDesignations,
  closeDb,
  closureRequests,
  companies,
  creditLines,
  creditLineVersions,
  defaultReports,
  disputes,
  getDb,
  memberships,
  notifications,
  projectLinks,
  projectMembers,
  projects,
  snapshots,
  staff,
  user,
} from "./index";
import { audit, hrefs, notify, rows, runRelease } from "./jobs";

const PASSWORD = "TagMyCredit-Demo-2026";
const SAR = 100;

/* ───────── Deterministic randomness ───────── */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── Companies & people ───────── */
type Key =
  | "alnoor" | "rawabi" | "najd" | "eastern" | "hijaz" | "sahil"
  | "qimma" | "wadi" | "barq" | "zahra" | "murjan" | "sadeem" | "darbina"
  | "cda" | "tihama" | "yanbu";

const COMPANIES: Record<Key, { name: string; nameAr: string; cr: string; rand: string; city: string; sector: string; verified: boolean }> = {
  alnoor: { name: "Al Noor Building Materials", nameAr: "النور لمواد البناء", cr: "1010456701", rand: "4821", city: "Riyadh", sector: "Building materials", verified: true },
  rawabi: { name: "Rawabi Steel Trading", nameAr: "روابي لتجارة الحديد", cr: "2050331802", rand: "7310", city: "Dammam", sector: "Steel", verified: true },
  najd: { name: "Najd Cement Supply", nameAr: "نجد لتوريد الأسمنت", cr: "1131207703", rand: "2954", city: "Buraydah", sector: "Cement", verified: true },
  eastern: { name: "Eastern Electrical Distribution", nameAr: "الشرقية للتوزيع الكهربائي", cr: "2051877604", rand: "6087", city: "Al Khobar", sector: "Electrical", verified: true },
  hijaz: { name: "Hijaz FMCG Distribution", nameAr: "الحجاز لتوزيع السلع الاستهلاكية", cr: "4030558905", rand: "1376", city: "Jeddah", sector: "FMCG distribution", verified: true },
  sahil: { name: "Sahil Industrial Supplies", nameAr: "الساحل للتجهيزات الصناعية", cr: "4031092206", rand: "8642", city: "Jeddah", sector: "Industrial supplies", verified: true },
  qimma: { name: "Qimma Contracting", nameAr: "القمة للمقاولات", cr: "1010784507", rand: "3519", city: "Riyadh", sector: "Construction", verified: true },
  wadi: { name: "Wadi Hanifa Builders", nameAr: "بناة وادي حنيفة", cr: "1010662908", rand: "9203", city: "Riyadh", sector: "Construction", verified: true },
  barq: { name: "Barq MEP Contractors", nameAr: "برق لمقاولات الكهروميكانيك", cr: "2050940109", rand: "5468", city: "Dammam", sector: "MEP contracting", verified: true },
  zahra: { name: "Zahra Facilities Co.", nameAr: "شركة زهرة للمرافق", cr: "4030215610", rand: "0735", city: "Jeddah", sector: "Facilities management", verified: true },
  murjan: { name: "Murjan Construction", nameAr: "مرجان للإنشاءات", cr: "4602113411", rand: "6190", city: "Yanbu", sector: "Construction", verified: false },
  sadeem: { name: "Sadeem Retail Group", nameAr: "مجموعة سديم للتجزئة", cr: "1010398812", rand: "2477", city: "Riyadh", sector: "Retail", verified: true },
  darbina: { name: "Dar Al Bina Contractors", nameAr: "دار البناء للمقاولات", cr: "4030876413", rand: "8015", city: "Jeddah", sector: "Construction", verified: true },
  cda: { name: "Coastal Development Authority", nameAr: "هيئة التطوير الساحلي", cr: "4030000114", rand: "1102", city: "Jeddah", sector: "Project owner", verified: true },
  tihama: { name: "Tihama Interiors", nameAr: "تهامة للتصميم الداخلي", cr: "4030447215", rand: "3348", city: "Jeddah", sector: "Fit-out", verified: true },
  yanbu: { name: "Yanbu Marine Works", nameAr: "ينبع للأعمال البحرية", cr: "4602775016", rand: "7726", city: "Yanbu", sector: "Marine works", verified: true },
};

type Person = { email: string; name: string; company: Key | null; role: "OWNER" | "ADMIN" | "CREDIT_MANAGER" | "VIEWER"; title: string; cfo?: string };
const PEOPLE: Person[] = [
  { email: "sara@alnoor.demo", name: "Sara Al-Harbi", company: "alnoor", role: "CREDIT_MANAGER", title: "Credit Manager" },
  { email: "majed@alnoor.demo", name: "Majed Al-Rashid", company: "alnoor", role: "OWNER", title: "Chief Financial Officer", cfo: "+966501110001" },
  { email: "omar@qimma.demo", name: "Omar Al-Qahtani", company: "qimma", role: "ADMIN", title: "Chief Financial Officer", cfo: "+966501110002" },
  { email: "layla@wadi.demo", name: "Layla Al-Otaibi", company: "wadi", role: "ADMIN", title: "Chief Financial Officer", cfo: "+966501110003" },
  { email: "faisal@barq.demo", name: "Faisal Al-Dosari", company: "barq", role: "ADMIN", title: "Chief Financial Officer", cfo: "+966501110004" },
  { email: "huda@zahra.demo", name: "Huda Al-Shehri", company: "zahra", role: "OWNER", title: "Owner", cfo: "+966501110005" },
  { email: "khalid@murjan.demo", name: "Khalid Al-Mutairi", company: "murjan", role: "OWNER", title: "Owner" },
  { email: "abdullah@sadeem.demo", name: "Abdullah Al-Zahrani", company: "sadeem", role: "ADMIN", title: "Group CFO", cfo: "+966501110006" },
  { email: "rana@darbina.demo", name: "Rana Al-Ghamdi", company: "darbina", role: "ADMIN", title: "Finance Director", cfo: "+966501110007" },
  { email: "turki@rawabi.demo", name: "Turki Al-Shammari", company: "rawabi", role: "OWNER", title: "CFO", cfo: "+966501110008" },
  { email: "nasser@najd.demo", name: "Nasser Al-Subaie", company: "najd", role: "OWNER", title: "General Manager" },
  { email: "hessa@eastern.demo", name: "Hessa Al-Mansour", company: "eastern", role: "OWNER", title: "CFO", cfo: "+966501110009" },
  { email: "yousef@hijaz.demo", name: "Yousef Bakr", company: "hijaz", role: "OWNER", title: "General Manager" },
  { email: "salem@sahil.demo", name: "Salem Al-Harthy", company: "sahil", role: "OWNER", title: "General Manager" },
  { email: "admin@cda.demo", name: "Fahad Al-Juhani", company: "cda", role: "OWNER", title: "Director" },
  { email: "admin@tihama.demo", name: "Mona Al-Saadi", company: "tihama", role: "OWNER", title: "Owner" },
  { email: "admin@yanbu.demo", name: "Saeed Al-Harbi", company: "yanbu", role: "OWNER", title: "Owner" },
  { email: "ops@tagmycredit.demo", name: "Noura (TMC Operations)", company: null, role: "VIEWER", title: "Operations" },
];

/* ───────── Payment profiles (designed so each buyer lands in its intended band and light) ───────── */
interface Profile {
  util: [number, number, number]; // start, end, curve power (higher = later rise)
  onTime: [number, number];
  late: [number, number, number, number]; // shares of outstanding: d1_30, d31_60, d61_90, d90_plus
}
const PROFILES: Record<string, Profile> = {
  excellent: { util: [0.3, 0.32, 1], onTime: [0.97, 0.99], late: [0.01, 0, 0, 0] },
  strong: { util: [0.4, 0.46, 1], onTime: [0.92, 0.95], late: [0.05, 0, 0, 0] },
  steady: { util: [0.36, 0.4, 1], onTime: [0.9, 0.93], late: [0.04, 0.01, 0, 0] },
  stretched: { util: [0.5, 0.75, 2], onTime: [0.74, 0.68], late: [0.12, 0.08, 0.03, 0] },
  rising: { util: [0.45, 0.84, 3], onTime: [0.72, 0.6], late: [0.22, 0.16, 0.1, 0.04] },
  distressed: { util: [0.8, 0.95, 1], onTime: [0.55, 0.4], late: [0.15, 0.12, 0.1, 0.2] },
};

/** [supplier, buyer, limit SAR, profile] */
const LINES: [Key, Key, number, keyof typeof PROFILES][] = [
  ["alnoor", "qimma", 2_400_000, "strong"],
  ["alnoor", "wadi", 1_200_000, "rising"],
  ["alnoor", "barq", 900_000, "distressed"],
  ["alnoor", "sadeem", 600_000, "excellent"],
  ["alnoor", "zahra", 250_000, "steady"],
  ["alnoor", "darbina", 1_500_000, "stretched"],
  ["rawabi", "qimma", 3_500_000, "strong"],
  ["rawabi", "wadi", 1_800_000, "rising"],
  ["rawabi", "barq", 1_100_000, "distressed"],
  ["rawabi", "darbina", 2_200_000, "stretched"],
  ["rawabi", "alnoor", 1_600_000, "steady"],
  ["rawabi", "eastern", 800_000, "steady"],
  ["najd", "qimma", 1_900_000, "strong"],
  ["najd", "wadi", 950_000, "rising"],
  ["najd", "darbina", 1_300_000, "stretched"],
  ["najd", "sadeem", 400_000, "excellent"],
  ["najd", "alnoor", 1_100_000, "steady"],
  ["najd", "rawabi", 700_000, "steady"],
  ["eastern", "barq", 1_400_000, "distressed"],
  ["eastern", "sadeem", 750_000, "excellent"],
  ["eastern", "qimma", 1_250_000, "strong"],
  ["eastern", "wadi", 650_000, "rising"],
  ["eastern", "darbina", 900_000, "stretched"],
  ["eastern", "rawabi", 500_000, "steady"],
  ["hijaz", "sadeem", 1_800_000, "excellent"],
  ["hijaz", "zahra", 300_000, "steady"],
  ["hijaz", "eastern", 350_000, "steady"],
  ["sahil", "sadeem", 500_000, "excellent"],
  ["sahil", "barq", 600_000, "distressed"],
  ["sahil", "wadi", 550_000, "rising"],
  ["sahil", "alnoor", 450_000, "steady"],
  ["sahil", "eastern", 400_000, "steady"],
  ["sahil", "rawabi", 600_000, "steady"],
];
/** Lines whose last month is not reported yet (Sara's "snapshots due"). */
const UNREPORTED_LAST_MONTH: [Key, Key][] = [["alnoor", "qimma"], ["alnoor", "sadeem"]];

function snapshotSeries(limitSar: number, profile: Profile, periods: string[], rand: () => number): SnapshotInput[] {
  const n = periods.length - 1;
  return periods.map((period, i) => {
    const t = i / n;
    const [u0, u1, k] = profile.util;
    const u = (u0 + (u1 - u0) * t ** k) * (1 + (rand() - 0.5) * 0.04);
    const outstanding = Math.round(limitSar * SAR * u);
    const [b1, b2, b3, b4] = profile.late.map((s) => Math.round(outstanding * s)) as [number, number, number, number];
    const q = profile.onTime[0] + (profile.onTime[1] - profile.onTime[0]) * t + (rand() - 0.5) * 0.02;
    const settledTotal = Math.round(outstanding * (0.8 + rand() * 0.15));
    return {
      period,
      outstanding,
      notDue: outstanding - b1 - b2 - b3 - b4,
      d1_30: b1,
      d31_60: b2,
      d61_90: b3,
      d90Plus: b4,
      settledTotal,
      settledOnTime: Math.min(settledTotal, Math.round(settledTotal * q)),
    };
  });
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function seed(): Promise<void> {
  const db = getDb();
  const [existing] = await rows<{ n: number }>(db, sql`select count(*)::int as n from companies where cr_number = ${COMPANIES.alnoor.cr}`);
  if (existing!.n > 0) {
    console.log("Demo data already present — nothing to do (run `pnpm db:reset` to rebuild).");
    return;
  }
  const now = clockNow();
  const lastPeriod = reportingPeriod(now);
  const periods = Array.from({ length: 15 }, (_, i) => addPeriods(lastPeriod, i - 14));
  const firstPeriod = periods[0]!;
  const startedAt = addDays(riyadhMidnight(firstPeriod), -20);
  const rand = prng(20261021);
  const hash = await hashPassword(PASSWORD);

  await db.transaction(async (tx) => {
    /* Companies */
    const inserted = await tx
      .insert(companies)
      .values(
        (Object.entries(COMPANIES) as [Key, (typeof COMPANIES)[Key]][]).map(([key, c]) => ({
          tmcId: buildTmcId(c.rand, c.cr, 1),
          legalName: c.name,
          legalNameAr: c.nameAr,
          crNumber: c.cr,
          city: c.city,
          sector: c.sector,
          status: c.verified ? ("VERIFIED" as const) : ("UNVERIFIED" as const),
          verifiedAt: c.verified ? addDays(startedAt, 2) : null,
          createdAt: key === "murjan" ? addHours(now, -26) : startedAt,
        })),
      )
      .returning({ id: companies.id, cr: companies.crNumber });
    const co = Object.fromEntries((Object.keys(COMPANIES) as Key[]).map((k) => [k, inserted.find((r) => r.cr === COMPANIES[k].cr)!.id])) as Record<Key, string>;

    /* People */
    const userIds = Object.fromEntries(PEOPLE.map((p) => [p.email, `usr_${p.email.replace(/[^a-z]/g, "_")}`]));
    await tx.insert(user).values(PEOPLE.map((p) => ({ id: userIds[p.email]!, name: p.name, email: p.email, emailVerified: true, createdAt: startedAt, updatedAt: startedAt })));
    await tx.insert(account).values(PEOPLE.map((p) => ({ id: `acc_${userIds[p.email]}`, accountId: userIds[p.email]!, providerId: "credential", userId: userIds[p.email]!, password: hash })));
    await tx.insert(memberships).values(PEOPLE.filter((p) => p.company).map((p) => ({ companyId: co[p.company!], userId: userIds[p.email]!, role: p.role, title: p.title })));
    await tx.insert(staff).values({ userId: userIds["ops@tagmycredit.demo"]! });
    const ops = userIds["ops@tagmycredit.demo"]!;
    await tx.insert(cfoDesignations).values(
      PEOPLE.filter((p) => p.cfo).map((p) => ({
        companyId: co[p.company!],
        userId: userIds[p.email]!,
        mobile: p.cfo!,
        title: p.title,
        status: "ACTIVE" as const,
        effectiveAt: addDays(startedAt, 4),
        nominatedBy: userIds[p.email]!,
        decidedBy: ops,
        decidedAt: addDays(startedAt, 2),
        createdAt: startedAt,
      })),
    );
    // Murjan: just registered, CFO nominated with an authority letter, waiting for ops.
    const [doc] = await tx
      .insert(attachments)
      .values({ companyId: co.murjan, ownerType: "cfo", fileName: "murjan-board-resolution.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, content: PDF, uploadedBy: userIds["khalid@murjan.demo"]! })
      .returning({ id: attachments.id });
    const [murjanCfo] = await tx
      .insert(cfoDesignations)
      .values({ companyId: co.murjan, userId: userIds["khalid@murjan.demo"]!, mobile: "+966501110010", title: "Owner & acting CFO", authorityDocId: doc!.id, nominatedBy: userIds["khalid@murjan.demo"]!, createdAt: addHours(now, -25) })
      .returning({ id: cfoDesignations.id });
    await tx.execute(sql`update attachments set owner_id = ${murjanCfo!.id} where id = ${doc!.id}`);

    /* Credit lines with 15 months of snapshots */
    const lineIds = new Map<string, string>();
    const tcl = async () => formatTclId(Number((await rows<{ n: string }>(tx, sql`select nextval('tcl_seq') as n`))[0]!.n));
    const supplierUser = (k: Key) => userIds[PEOPLE.find((p) => p.company === k)!.email]!;
    const cfoUser = (k: Key) => userIds[PEOPLE.find((p) => p.company === k && p.cfo)!.email]!;
    const allSnaps: (typeof snapshots.$inferInsert)[] = [];
    for (const [s, b, limit, profile] of LINES) {
      const [line] = await tx
        .insert(creditLines)
        .values({ tclId: await tcl(), supplierCompanyId: co[s], buyerCompanyId: co[b], status: "ACTIVE", currentVersion: 1, createdBy: supplierUser(s), createdAt: startedAt, confirmedAt: addDays(startedAt, 6) })
        .returning({ id: creditLines.id, tclId: creditLines.tclId });
      lineIds.set(`${s}>${b}`, line!.id);
      await tx.insert(creditLineVersions).values({
        lineId: line!.id,
        version: 1,
        limitHalalas: limit * SAR,
        termsDays: profile === "excellent" ? 30 : 60,
        effectiveDate: firstPeriod,
        attestation: `${COMPANIES[s].name} attests that it extends trade credit to ${COMPANIES[b].name} of up to SAR ${limit.toLocaleString("en-US")} on ${profile === "excellent" ? 30 : 60}-day terms, effective ${firstPeriod}, and that the monthly figures it reports for this line will be accurate.`,
        status: "CONFIRMED",
        proposedBy: supplierUser(s),
        proposedAt: startedAt,
        expiresAt: addDays(startedAt, 14),
        decidedBy: cfoUser(b),
        decidedAt: addDays(startedAt, 6),
      });
      const skipLast = UNREPORTED_LAST_MONTH.some(([x, y]) => x === s && y === b);
      for (const snap of snapshotSeries(limit, PROFILES[profile]!, periods, rand)) {
        if (skipLast && snap.period === lastPeriod) continue;
        const submittedAt = new Date(Math.min(addHours(riyadhMidnight(`${addPeriods(snap.period, 1).slice(0, 8)}05`), 9).getTime(), addHours(now, -2).getTime()));
        allSnaps.push({ lineId: line!.id, ...snap, submittedBy: supplierUser(s), submittedAt });
      }
    }
    await tx.insert(snapshots).values(allSnaps);

    /* Qimma's CFO: a new line PENDING (Sahil) and an amendment PENDING (Al Noor, limit 2.4M → 3.0M) */
    const [pending] = await tx
      .insert(creditLines)
      .values({ tclId: await tcl(), supplierCompanyId: co.sahil, buyerCompanyId: co.qimma, createdBy: supplierUser("sahil"), createdAt: addDays(now, -2) })
      .returning({ id: creditLines.id, tclId: creditLines.tclId });
    await tx.insert(creditLineVersions).values([
      {
        lineId: pending!.id,
        version: 1,
        limitHalalas: 750_000 * SAR,
        termsDays: 45,
        effectiveDate: addPeriods(lastPeriod, 1),
        attestation: `${COMPANIES.sahil.name} attests that it extends trade credit to ${COMPANIES.qimma.name} of up to SAR 750,000 on 45-day terms, effective ${addPeriods(lastPeriod, 1)}, and that the monthly figures it reports for this line will be accurate.`,
        proposedBy: supplierUser("sahil"),
        proposedAt: addDays(now, -2),
        expiresAt: addDays(now, 12),
      },
      {
        lineId: lineIds.get("alnoor>qimma")!,
        version: 2,
        limitHalalas: 3_000_000 * SAR,
        termsDays: 60,
        effectiveDate: addPeriods(lastPeriod, 1),
        attestation: `${COMPANIES.alnoor.name} attests that it extends trade credit to ${COMPANIES.qimma.name} of up to SAR 3,000,000 on 60-day terms, effective ${addPeriods(lastPeriod, 1)}, and that the monthly figures it reports for this line will be accurate.`,
        proposedBy: userIds["sara@alnoor.demo"]!,
        proposedAt: addDays(now, -1),
        expiresAt: addDays(now, 13),
      },
    ]);

    /* Wadi Hanifa: open dispute (Rawabi must respond), closure request to Al Noor, default under review (Najd) */
    const wadiRawabi = lineIds.get("rawabi>wadi")!;
    const [dispute] = await tx
      .insert(disputes)
      .values({ lineId: wadiRawabi, raisedBy: userIds["layla@wadi.demo"]!, reason: "The last snapshot shows SAR 210,000 overdue 31–60 days; those invoices were paid on time and the receipts are attached.", respondBy: addDays(now, 11), createdAt: addDays(now, -3) })
      .returning({ id: disputes.id });
    const [closure] = await tx
      .insert(closureRequests)
      .values({ lineId: lineIds.get("alnoor>wadi")!, requestedBy: userIds["layla@wadi.demo"]!, reason: "The Al Malqa tower project has finished; we no longer buy from this account.", respondBy: addDays(now, 9), createdAt: addDays(now, -5) })
      .returning({ id: closureRequests.id });
    const najdWadi = lineIds.get("najd>wadi")!;
    const najdWadiLatest = allSnaps.filter((s) => s.lineId === najdWadi).at(-1)!;
    const [underReview] = await tx
      .insert(defaultReports)
      .values({
        lineId: najdWadi,
        reportedBy: userIds["nasser@najd.demo"]!,
        amountHalalas: najdWadiLatest.d90Plus,
        oldestDueDate: addPeriods(lastPeriod, -4),
        note: "Three cement deliveries for the Al Malqa site remain unpaid despite four reminders.",
        buyerReplyBy: addDays(now, 7),
        createdAt: addDays(now, -3),
      })
      .returning({ id: defaultReports.id });

    /* Barq: upheld unpaid default (Eastern), alert sent to its other suppliers */
    const easternBarq = lineIds.get("eastern>barq")!;
    const upheldAt = riyadhMidnight(addPeriods(lastPeriod, -3).replace(/-01$/, "-20"));
    const [upheld] = await tx
      .insert(defaultReports)
      .values({
        lineId: easternBarq,
        reportedBy: userIds["hessa@eastern.demo"]!,
        amountHalalas: 186_000 * SAR,
        oldestDueDate: addPeriods(lastPeriod, -8),
        note: "Switchgear delivered for the Dammam logistics park; invoices unpaid for over 150 days.",
        status: "UPHELD",
        buyerReply: "We are negotiating a payment plan.",
        buyerReplyBy: addDays(upheldAt, -5),
        buyerRepliedAt: addDays(upheldAt, -8),
        decidedBy: ops,
        decidedAt: upheldAt,
        decisionNote: "Invoices, delivery notes and the 90+ aging verified.",
        alertSent: true,
        createdAt: addDays(upheldAt, -14),
      })
      .returning({ id: defaultReports.id });
    await tx.insert(attachments).values([
      { companyId: co.wadi, ownerType: "dispute", ownerId: dispute!.id, fileName: "payment-receipts.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, content: PDF, uploadedBy: userIds["layla@wadi.demo"]! },
      { companyId: co.najd, ownerType: "default", ownerId: underReview!.id, fileName: "najd-invoices-and-reminders.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, content: PDF, uploadedBy: userIds["nasser@najd.demo"]! },
      { companyId: co.eastern, ownerType: "default", ownerId: upheld!.id, fileName: "eastern-switchgear-invoices.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, content: PDF, uploadedBy: userIds["hessa@eastern.demo"]! },
    ]);

    /* Project: Red Sea Coastal Resort — Phase 2 (owned by Al Noor) */
    const [project] = await tx
      .insert(projects)
      .values({ ownerCompanyId: co.alnoor, name: "Red Sea Coastal Resort — Phase 2", location: "Umluj, Red Sea coast", createdBy: userIds["sara@alnoor.demo"]!, createdAt: addDays(now, -40) })
      .returning({ id: projects.id });
    const tiers: [Key, 0 | 1 | 2 | 3, string][] = [
      ["cda", 0, "Project owner"],
      ["qimma", 1, "Main contractor — resort buildings"],
      ["darbina", 1, "Main contractor — infrastructure"],
      ["wadi", 2, "Structural works"],
      ["barq", 2, "MEP works"],
      ["tihama", 2, "Interior fit-out"],
      ["zahra", 2, "Site facilities"],
      ["yanbu", 2, "Marine works"],
      ["alnoor", 3, "Building materials"],
      ["rawabi", 3, "Rebar and steel"],
      ["najd", 3, "Cement"],
      ["eastern", 3, "Electrical equipment"],
      ["sahil", 3, "Industrial supplies"],
      ["hijaz", 3, "Site consumables"],
    ];
    await tx.insert(projectMembers).values(tiers.map(([k, tier, roleLabel]) => ({ projectId: project!.id, companyId: co[k], tier, roleLabel })));
    const links: [Key, Key][] = [
      ["cda", "qimma"], ["cda", "darbina"],
      ["qimma", "wadi"], ["qimma", "barq"], ["qimma", "tihama"], ["darbina", "zahra"], ["darbina", "yanbu"],
      ["wadi", "alnoor"], ["barq", "alnoor"], ["zahra", "alnoor"],
      ["wadi", "rawabi"], ["yanbu", "rawabi"], ["tihama", "rawabi"],
      ["barq", "eastern"], ["zahra", "hijaz"], ["tihama", "sahil"], ["yanbu", "najd"],
    ];
    await tx.insert(projectLinks).values(links.map(([payer, payee]) => ({ projectId: project!.id, payerCompanyId: co[payer], payeeCompanyId: co[payee] })));

    /* Score releases for the last three months, by the real release code, each as of its release day */
    const latest = scheduledReleasePeriod(now) ?? addPeriods(lastPeriod, -1);
    for (const period of [addPeriods(latest, -2), addPeriods(latest, -1), latest]) {
      // Alerts from earlier releases are history: mark them read so the latest release and the alerts below stand out.
      if (period === latest) await tx.update(notifications).set({ readAt: now });
      const res = await runRelease(tx, { period, now: releaseAt(period), runBy: null });
      if (!res.ok) throw new Error(`Release ${period} failed: ${res.error}`);
    }

    const ln = (k: string) => lineIds.get(k)!;
    await notify(tx, [
      { companyId: co.alnoor, kind: "NETWORK_ALERT", params: { buyer: COMPANIES.barq.name, buyerTmcId: buildTmcId(COMPANIES.barq.rand, COMPANIES.barq.cr, 1), defaultId: upheld!.id }, href: hrefs.check(co.barq) },
      { companyId: co.rawabi, kind: "NETWORK_ALERT", params: { buyer: COMPANIES.barq.name, buyerTmcId: buildTmcId(COMPANIES.barq.rand, COMPANIES.barq.cr, 1), defaultId: upheld!.id }, href: hrefs.check(co.barq) },
      { companyId: co.sahil, kind: "NETWORK_ALERT", params: { buyer: COMPANIES.barq.name, buyerTmcId: buildTmcId(COMPANIES.barq.rand, COMPANIES.barq.cr, 1), defaultId: upheld!.id }, href: hrefs.check(co.barq) },
      { companyId: co.alnoor, kind: "CLOSURE_REQUESTED", lineId: ln("alnoor>wadi"), params: { buyer: COMPANIES.wadi.name, tclId: "" }, href: hrefs.line(ln("alnoor>wadi")) },
      { companyId: co.rawabi, kind: "DISPUTE_OPENED", lineId: wadiRawabi, params: { buyer: COMPANIES.wadi.name, tclId: "" }, href: hrefs.line(wadiRawabi) },
      { companyId: co.wadi, kind: "DEFAULT_FILED", lineId: najdWadi, params: { tclId: "" }, href: hrefs.line(najdWadi) },
      { companyId: co.qimma, kind: "LINE_CONFIRMATION_REQUESTED", lineId: pending!.id, params: { supplier: COMPANIES.sahil.name, tclId: pending!.tclId, version: 1 }, href: hrefs.confirm(pending!.id) },
      { companyId: co.qimma, kind: "AMENDMENT_REQUESTED", lineId: ln("alnoor>qimma"), params: { supplier: COMPANIES.alnoor.name, tclId: "", version: 2 }, href: hrefs.confirm(ln("alnoor>qimma")) },
    ]);
    await tx.execute(
      sql`update notifications n set payload = jsonb_set(n.payload, '{params,tclId}', to_jsonb(l.tcl_id))
          from credit_lines l where l.id = n.line_id and n.payload #>> '{params,tclId}' = ''`,
    );
    await audit(tx, { actor: null, companyId: null, entityType: "seed", entityId: "demo", action: "seed.loaded", data: { lastPeriod, closureId: closure!.id } });
  });
  console.log(`Demo data loaded (snapshots ${periods[0]} → ${lastPeriod}). Password for every account: ${PASSWORD}`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
