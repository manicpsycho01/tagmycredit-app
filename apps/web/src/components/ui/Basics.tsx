/** Server-safe presentational primitives. */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/constants";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact } from "../format";

export function Panel({ title, kicker, actions, children, className = "", flush = false, id }: {
  title?: ReactNode; kicker?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string;
}) {
  return (
    <section className={`panel ${flush ? "panel-flush" : ""} ${className}`} id={id} aria-labelledby={id && title ? `${id}-h` : undefined}>
      {(title || actions || kicker) && (
        <div className="ph">
          <div className="stack" style={{ gap: 2 }}>
            {kicker && <span className="pk">{kicker}</span>}
            {title && <h2 id={id ? `${id}-h` : undefined}>{title}</h2>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body, actions, icon }: { title: ReactNode; body?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph" aria-hidden="true">{icon ?? <StarIcon />}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "amber";
export function StatusPill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill c-${tone} ${dot ? "" : "no-dot"}`}>{children}</span>;
}

export function Money({ halalas, locale, compact = false, className = "" }: { halalas: number | null | undefined; locale: Locale; compact?: boolean; className?: string }) {
  return <span className={`num ${className}`}>{compact ? formatMoneyCompact(halalas, locale) : formatMoney(halalas, locale)}</span>;
}

export function DateText({ iso, locale, time = false }: { iso: string | null | undefined; locale: Locale; time?: boolean }) {
  if (!iso) return <span>—</span>;
  return <time dateTime={iso}>{time ? formatDateTime(iso, locale) : formatDate(iso, locale)}</time>;
}

export function PageHead({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="t">
        {crumbs && <nav className="crumbs" aria-label="Breadcrumb">{crumbs}</nav>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function AlertBox({ tone = "on", title, children, icon }: { tone?: "on" | "warn" | "info" | "off"; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`alert ${tone === "off" ? "" : tone}`} role={tone === "on" ? "alert" : undefined}>
      {icon ?? <WarnIcon />}
      <div>{title && <b className="t">{title}</b>}<span>{children}</span></div>
    </div>
  );
}

export const StarIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" /><rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" /></g></svg>
);
export const WarnIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 10v5M12 17.5v.5" stroke="currentColor" strokeWidth="2" /></svg>
);
export const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
);
export const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 6 12l8-8" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
);
export const ArrowIcon = () => (
  <svg className="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
);
