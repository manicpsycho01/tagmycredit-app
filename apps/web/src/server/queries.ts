// STUB — the backend agent replaces this with real loaders. Signatures must match `Queries` in ./contracts.
import "server-only";
import type { Queries } from "./contracts";

const notImplemented = (name: string) => async (): Promise<never> => {
  throw new Error(`queries.${name} not implemented yet`);
};

export const getSession: Queries["getSession"] = notImplemented("getSession");
export const getHome: Queries["getHome"] = notImplemented("getHome");
export const listLines: Queries["listLines"] = notImplemented("listLines");
export const getLine: Queries["getLine"] = notImplemented("getLine");
export const getSnapshotWorklist: Queries["getSnapshotWorklist"] = notImplemented("getSnapshotWorklist");
export const getScoreCard: Queries["getScoreCard"] = notImplemented("getScoreCard");
export const listNotifications: Queries["listNotifications"] = notImplemented("listNotifications");
export const getCompanyPage: Queries["getCompanyPage"] = notImplemented("getCompanyPage");
export const listProjects: Queries["listProjects"] = notImplemented("listProjects");
export const getProject: Queries["getProject"] = notImplemented("getProject");
export const getOpsQueue: Queries["getOpsQueue"] = notImplemented("getOpsQueue");
export const listReleases: Queries["listReleases"] = notImplemented("listReleases");
export const listAudit: Queries["listAudit"] = notImplemented("listAudit");
export const listOutbox: Queries["listOutbox"] = notImplemented("listOutbox");
export const listDemoPersonas: Queries["listDemoPersonas"] = notImplemented("listDemoPersonas");
