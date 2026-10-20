/**
 * Data table that becomes a list of stacked cards when its container is < 640 px wide. Server component
 * (pure markup + CSS container query), builds on the global `.tbl` / `.tbl-wrap` styles.
 *
 * Semantics: explicit ARIA table roles are set on every element, because Safari/VoiceOver drop the
 * implicit table semantics once `display` changes. In card mode each cell shows its column label via
 * an aria-hidden span (screen readers already get the header association).
 *
 * Whole-row links: give `rowHref`; the primary cell's link is stretched over the row/card. Other
 * interactive elements in cells stay clickable above it.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export interface RTColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Card title. Exactly one column should be primary. */
  primary?: boolean;
  align?: "start" | "end";
  /** Label in card mode if `header` is not plain text (or should be shorter). */
  cardLabel?: ReactNode;
  /** "full" spans both card columns (status lines, actions); "hide" removes the cell in card mode. */
  card?: "half" | "full" | "hide";
  /** Hide visually in table mode only (e.g. a details column that only makes sense in cards). */
  tableHidden?: boolean;
}

export interface ResponsiveTableProps<T> {
  columns: RTColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Visually hidden caption (accessible name for the table). */
  caption: string;
  rowHref?: (row: T) => string | null;
  /** Rendered instead of the table when rows is empty. */
  empty?: ReactNode;
  /** Long lists (> ~30 rows): skip rendering work for off-screen cards (content-visibility). */
  longList?: boolean;
  /** Optional `data-tone` per row for a coloured start border in card mode: ok | warn | bad | neutral. */
  rowTone?: (row: T) => "ok" | "warn" | "bad" | "neutral" | null;
  className?: string;
}

export function ResponsiveTable<T>({
  columns, rows, rowKey, caption, rowHref, empty, longList, rowTone, className,
}: ResponsiveTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={["rt", className].filter(Boolean).join(" ")} data-long={longList || undefined}>
      <div className="tbl-wrap rt-scroll">
        <table className="tbl rt-table" role="table">
          <caption className="sr">{caption}</caption>
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((c) => (
                <th
                  key={c.key} role="columnheader" scope="col"
                  className={[c.align === "end" ? "end" : "", c.tableHidden ? "rt-thide" : ""].join(" ").trim() || undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row) => {
              const href = rowHref?.(row) ?? null;
              const tone = rowTone?.(row) ?? null;
              return (
                <tr key={rowKey(row)} role="row" className={href ? "rt-linked" : undefined} data-tone={tone ?? undefined}>
                  {columns.map((c) => {
                    const content = c.cell(row);
                    const cls = [
                      c.primary ? "rt-primary" : "",
                      c.align === "end" ? "end" : "",
                      c.card === "full" ? "rt-full" : "",
                      c.card === "hide" ? "rt-chide" : "",
                      c.tableHidden ? "rt-thide" : "",
                    ].join(" ").replace(/\s+/g, " ").trim();
                    return (
                      <td key={c.key} role="cell" className={cls || undefined}>
                        {!c.primary ? <span className="rt-label" aria-hidden="true">{c.cardLabel ?? c.header}</span> : null}
                        {c.primary && href ? (
                          <Link href={href} className="rt-link">{content}</Link>
                        ) : (
                          <span className="rt-val">{content}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
