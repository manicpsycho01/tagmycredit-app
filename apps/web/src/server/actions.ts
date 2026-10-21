"use server";
import { TERMS_DAYS, isCrNumber, isPeriod } from "@tmc/domain";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { Actions } from "./contracts";
import { fail, parse, runAction } from "./guard";
import { DEMO_PERSONAS } from "./services/demo";
import * as c from "./services/cases";
import * as w from "./services/writes";
import { isDemoMode } from "./session";

const required = (max = 200) => z.string().trim().min(1, { error: "errors.required" }).max(max, { error: "errors.tooLong" });
const uuid = z.uuid({ error: "errors.invalid" });
const amount = z.number({ error: "errors.amountInvalid" }).int({ error: "errors.amountInvalid" }).min(0, { error: "errors.amountInvalid" });

/** FormData → plain object of its string fields (files excluded). */
const formObject = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
const formFiles = (form: FormData) => form.getAll("files").filter((v): v is File => typeof v !== "string");

const notImplemented = async () => ({ ok: false as const, error: "errors.notImplemented" });

export const registerCompany: Actions["registerCompany"] = async (input) =>
  runAction(() =>
    w.registerCompany(
      parse(
        z.object({
          legalName: required(),
          legalNameAr: z.string().trim().max(200).optional(),
          crNumber: z.string().trim().refine(isCrNumber, { error: "errors.crInvalid" }),
          city: required(80),
          sector: required(80),
          title: z.string().trim().max(120).optional(),
        }),
        input,
      ),
    ),
  );

export const demoSignIn: Actions["demoSignIn"] = async (email) =>
  runAction(async () => {
    if (!isDemoMode()) fail("errors.demoDisabled");
    if (!DEMO_PERSONAS.some((p) => p.email === email)) fail("errors.notFound");
    await auth.api.demoSignIn({ body: { email }, headers: await headers() });
  });

export const setLocale: Actions["setLocale"] = async (locale) => {
  (await cookies()).set("tmc_locale", locale === "ar" ? "ar" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
};

export const lookupCompany: Actions["lookupCompany"] = async (q) =>
  runAction(() => w.lookupCompany(parse(z.string().trim().min(1, { error: "errors.required" }).max(40), q)));

export const createLine: Actions["createLine"] = async (input) =>
  runAction(() =>
    w.createLine(
      parse(
        z.object({
          buyerCompanyId: uuid,
          limitSar: z.number({ error: "errors.limitRange" }).positive({ error: "errors.limitRange" }),
          termsDays: z.number().refine((n): n is (typeof TERMS_DAYS)[number] => (TERMS_DAYS as readonly number[]).includes(n), { error: "errors.termsInvalid" }),
          effectiveDate: z.string(),
        }),
        input,
      ) as Parameters<typeof w.createLine>[0],
    ),
  );

export const closeLine: Actions["closeLine"] = async (input) =>
  runAction(() => w.closeLine(parse(z.object({ lineId: uuid, reason: required(500) }), input)));

export const submitSnapshot: Actions["submitSnapshot"] = async (input) =>
  runAction(() =>
    w.submitSnapshot(
      parse(
        z.object({
          lineId: uuid,
          supplierNote: z.string().max(2000).optional(),
          period: z.string().refine(isPeriod, { error: "errors.periodInvalid" }),
          outstanding: amount,
          notDue: amount,
          d1_30: amount,
          d31_60: amount,
          d61_90: amount,
          d90Plus: amount,
          settledTotal: amount,
          settledOnTime: amount,
        }),
        input,
      ),
    ),
  );

export const requestOtp: Actions["requestOtp"] = async (input) => runAction(() => w.requestOtp(parse(z.object({ versionId: uuid }), input)));

export const confirmVersion: Actions["confirmVersion"] = async (input) =>
  runAction(() => w.confirmVersion(parse(z.object({ versionId: uuid, code: z.string().trim().regex(/^\d{6}$/, { error: "errors.otpFormat" }) }), input)));

export const declineVersion: Actions["declineVersion"] = async (input) =>
  runAction(() => w.declineVersion(parse(z.object({ versionId: uuid, reason: z.string().trim().max(500).optional() }), input)));

export const markNotificationsRead: Actions["markNotificationsRead"] = async (ids) =>
  runAction(() => w.markNotificationsRead(parse(z.array(uuid).max(500).optional(), ids)));

export const verifyCompany: Actions["verifyCompany"] = async (input) =>
  runAction(() => w.verifyCompany(parse(z.object({ companyId: uuid, approve: z.boolean(), note: z.string().max(2000).optional() }), input)));

export const decideCfo: Actions["decideCfo"] = async (input) =>
  runAction(() =>
    w.decideCfo(parse(z.object({ cfoId: uuid, approve: z.boolean(), waiveCoolingOff: z.boolean().optional(), note: z.string().max(2000).optional() }), input)),
  );

export const decideDispute: Actions["decideDispute"] = async (input) =>
  runAction(() => w.decideDispute(parse(z.object({ disputeId: uuid, uphold: z.boolean(), note: required(2000) }), input)));

export const decideDefault: Actions["decideDefault"] = async (input) =>
  runAction(() => w.decideDefault(parse(z.object({ defaultId: uuid, decision: z.enum(["UPHOLD", "REJECT", "REQUEST_INFO"]), note: required(2000) }), input)));

export const runScoreRelease: Actions["runScoreRelease"] = async (input) =>
  runAction(() => w.runScoreRelease(parse(z.object({ period: z.string().refine(isPeriod, { error: "errors.periodInvalid" }).optional() }).optional(), input)));

export const runTick: Actions["runTick"] = async () => runAction(() => w.tickNow());

/* Not yet implemented (MVP scope cut by the lead); the UI shows errors.notImplemented. */
export const inviteMember: Actions["inviteMember"] = notImplemented;
export const changeMemberRole: Actions["changeMemberRole"] = notImplemented;
export const nominateCfo: Actions["nominateCfo"] = notImplemented;
export const amendLine: Actions["amendLine"] = async (input) =>
  runAction(() => c.amendLine(parse(z.object({ lineId: uuid, limitSar: z.number({ error: "errors.amountInvalid" }).positive({ error: "errors.amountInvalid" }), termsDays: z.union(TERMS_DAYS.map((d) => z.literal(d))), effectiveDate: z.iso.date({ error: "errors.dateInvalid" }) }), input)));
export const uploadSnapshotsCsv: Actions["uploadSnapshotsCsv"] = notImplemented;
export const respondDispute: Actions["respondDispute"] = async (input) => runAction(() => c.respondDispute(parse(z.object({ disputeId: uuid, response: required(2000) }), input)));
export const respondClosure: Actions["respondClosure"] = async (input) =>
  runAction(() => c.respondClosure(parse(z.object({ closureId: uuid, accept: z.boolean(), objection: z.string().trim().max(2000).optional() }), input)));
export const fileDefault: Actions["fileDefault"] = async (form) =>
  runAction(() =>
    c.fileDefault({
      ...parse(z.object({ lineId: uuid, amountSar: z.coerce.number({ error: "errors.amountInvalid" }).positive({ error: "errors.amountInvalid" }), oldestDueDate: z.iso.date({ error: "errors.dateInvalid" }), note: required(2000) }), formObject(form)),
      files: formFiles(form),
    }),
  );
export const retractDefault: Actions["retractDefault"] = async (input) => runAction(() => c.retractDefault(parse(z.object({ defaultId: uuid }), input)));
export const markDefaultSettled: Actions["markDefaultSettled"] = async (input) => runAction(() => c.markDefaultSettled(parse(z.object({ defaultId: uuid }), input)));
export const openDispute: Actions["openDispute"] = async (form) =>
  runAction(() => c.openDispute({ ...parse(z.object({ lineId: uuid, reason: required(2000) }), formObject(form)), files: formFiles(form) }));
export const requestClosure: Actions["requestClosure"] = async (input) => runAction(() => c.requestClosure(parse(z.object({ lineId: uuid, reason: required(2000) }), input)));
export const replyDefault: Actions["replyDefault"] = async (input) => runAction(() => c.replyDefault(parse(z.object({ defaultId: uuid, reply: required(2000) }), input)));
export const createProject: Actions["createProject"] = notImplemented;
export const addProjectMember: Actions["addProjectMember"] = notImplemented;
export const removeProjectMember: Actions["removeProjectMember"] = notImplemented;
export const addProjectLink: Actions["addProjectLink"] = notImplemented;
export const removeProjectLink: Actions["removeProjectLink"] = notImplemented;
export const confirmDefaultSettled: Actions["confirmDefaultSettled"] = async (input) => runAction(() => c.confirmDefaultSettled(parse(z.object({ defaultId: uuid }), input)));
export const voidLine: Actions["voidLine"] = async (input) => runAction(() => c.voidLine(parse(z.object({ lineId: uuid, reason: required(2000) }), input)));
export const setLineSuspended: Actions["setLineSuspended"] = async (input) => runAction(() => c.setLineSuspended(parse(z.object({ lineId: uuid, suspended: z.boolean(), note: required(2000) }), input)));
export const decideSnapshot: Actions["decideSnapshot"] = async (input) => runAction(() => c.decideSnapshot(parse(z.object({ snapshotId: uuid, release: z.boolean(), note: required(2000) }), input)));
