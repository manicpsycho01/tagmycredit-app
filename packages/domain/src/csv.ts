/** CSV upload of snapshots (SPEC §4): `tcl_id,period,outstanding,not_due,d1_30,d31_60,d61_90,d90_plus,settled_total,settled_on_time`, amounts in SAR. */
import { parseSar } from "./money";
import { SNAPSHOT_AMOUNT_FIELDS } from "./snapshot";
import type { SnapshotInput } from "./types";

export const SNAPSHOT_CSV_COLUMNS = [
  "tcl_id",
  "period",
  "outstanding",
  "not_due",
  "d1_30",
  "d31_60",
  "d61_90",
  "d90_plus",
  "settled_total",
  "settled_on_time",
] as const;

export const SNAPSHOT_CSV_MAX_ROWS = 2000;

export interface CsvSnapshotRow {
  /** 1-based line number in the file (header = 1). */
  row: number;
  tclId: string;
  snapshot: SnapshotInput;
}
export interface CsvRowError {
  row: number;
  error: string;
}

/** Split one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** A period may be written 'YYYY-MM' or 'YYYY-MM-01'. */
const normalisePeriod = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v);

/**
 * Parse the file text. Structural problems (bad header, too many rows) return `fileError`; per-row problems are
 * listed in `errors` and those rows are skipped. Business validation (sums, periods) happens later per row.
 */
export function parseSnapshotCsv(text: string): { rows: CsvSnapshotRow[]; errors: CsvRowError[]; fileError: string | null } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  if (header.length !== SNAPSHOT_CSV_COLUMNS.length || header.some((h, i) => h !== SNAPSHOT_CSV_COLUMNS[i])) {
    return { rows: [], errors: [], fileError: "errors.csvHeader" };
  }
  const body = lines.slice(1).map((l, i) => ({ text: l, row: i + 2 })).filter((l) => l.text.trim() !== "");
  if (body.length === 0) return { rows: [], errors: [], fileError: "errors.csvEmpty" };
  if (body.length > SNAPSHOT_CSV_MAX_ROWS) return { rows: [], errors: [], fileError: "errors.csvTooManyRows" };

  const rows: CsvSnapshotRow[] = [];
  const errors: CsvRowError[] = [];
  for (const { text: line, row } of body) {
    const cells = splitCsvLine(line);
    if (cells.length !== SNAPSHOT_CSV_COLUMNS.length) {
      errors.push({ row, error: "errors.csvColumns" });
      continue;
    }
    const [tclId, period, ...amounts] = cells as [string, string, ...string[]];
    const halalas = amounts.map((a) => parseSar(a));
    if (halalas.some((h) => h === null)) {
      errors.push({ row, error: "errors.amountInvalid" });
      continue;
    }
    const snapshot = { period: normalisePeriod(period) } as SnapshotInput;
    SNAPSHOT_AMOUNT_FIELDS.forEach((f, i) => (snapshot[f] = halalas[i]!));
    rows.push({ row, tclId: tclId.toUpperCase(), snapshot });
  }
  return { rows, errors, fileError: null };
}
