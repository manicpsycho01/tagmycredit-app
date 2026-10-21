"use client";
/** The website's NEOM map rebuilt on real ProjectMap data: tiers, curved links (ResizeObserver layout),
 *  hover/focus preview + click pin, detail panel, shared-supplier badge, cascade view, phone tier list,
 *  and payment arrows that move only when motion is allowed. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMap, ProjectNode } from "@/server/contracts";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/core";
import { TrafficLight, BandChip } from "../score/Score";

const TIER_KEYS: MessageKey[] = ["map.tier0", "map.tier1", "map.tier2", "map.tier3"];
const SPEED = { GREEN: 80, YELLOW: 30, RED: 12, NONE: 45 } as const;

export function SupplyChainMap({ map }: { map: ProjectMap }) {
  const t = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const arrowRefs = useRef<(SVGPathElement | null)[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [paths, setPaths] = useState<string[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const [cascade, setCascade] = useState(false);
  const sel = prev ?? pin;

  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.companyId, n])), [map.nodes]);
  const tiers = useMemo(() => [0, 1, 2, 3].map((k) => map.nodes.filter((n) => n.tier === k)), [map.nodes]);
  const payersOf = useCallback((id: string) => map.links.filter((l) => l.payee === id).map((l) => l.payer), [map.links]);
  const payeesOf = useCallback((id: string) => map.links.filter((l) => l.payer === id).map((l) => l.payee), [map.links]);
  const downstream = useMemo(() => {
    if (!sel) return new Set<string>();
    const seen = new Set<string>(); const q = [sel];
    while (q.length) { const c = q.shift()!; for (const p of payeesOf(c)) if (!seen.has(p) && p !== sel) { seen.add(p); q.push(p); } }
    return seen;
  }, [sel, payeesOf]);
  const lightOf = (id: string) => byId.get(id)?.score?.light ?? "NONE";
  const nm = (id: string) => byId.get(id)?.name ?? "";
  const list = (ids: string[]) => ids.map(nm).join(t.locale === "ar" ? "، " : ", ");

  /* layout: curved links between node boxes, recomputed on resize */
  const layout = useCallback(() => {
    const el = mapRef.current; if (!el) return;
    const mr = el.getBoundingClientRect(); if (!mr.width) return;
    setSize({ w: mr.width, h: mr.height });
    setPaths(map.links.map((l) => {
      const a = nodeRefs.current.get(l.payer)?.getBoundingClientRect(), b = nodeRefs.current.get(l.payee)?.getBoundingClientRect();
      if (!a || !b) return "";
      const x1 = a.left + a.width / 2 - mr.left, y1 = a.bottom - mr.top, x2 = b.left + b.width / 2 - mr.left, y2 = b.top - mr.top, my = (y1 + y2) / 2;
      return `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
    }));
  }, [map.links]);
  useEffect(() => {
    layout();
    const ro = new ResizeObserver(layout);
    if (mapRef.current) ro.observe(mapRef.current);
    document.fonts?.ready.then(layout).catch(() => {});
    return () => ro.disconnect();
  }, [layout]);

  /* payment arrows: only for links touching the selection, only when motion is allowed and visible */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0; const off = map.links.map(() => 0);
    const active = map.links.map((l) => !!sel && (cascade ? (l.payer === sel || downstream.has(l.payer)) : (l.payer === sel || l.payee === sel)));
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      map.links.forEach((l, i) => {
        const a = arrowRefs.current[i], p = pathRefs.current[i];
        if (!a || !p) return;
        if (!active[i] || mq.matches) { a.setAttribute("visibility", "hidden"); return; }
        const L = p.getTotalLength(); if (!L) return;
        off[i] = ((off[i] ?? 0) + SPEED[lightOf(l.payer)] * dt) % L;
        const p1 = p.getPointAtLength(off[i]!), p2 = p.getPointAtLength(Math.min(L, off[i]! + 1));
        a.setAttribute("visibility", "visible");
        a.setAttribute("transform", `translate(${p1.x.toFixed(1)} ${p1.y.toFixed(1)}) rotate(${(Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI).toFixed(1)})`);
      });
      if (active.some(Boolean) && !mq.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, cascade, downstream, paths, map.links]);

  const toggle = (id: string) => { setPin((p) => (p === id ? null : id)); setPrev(null); };
  const dimNode = (id: string) => !!sel && (cascade ? id !== sel && !downstream.has(id) : id !== sel && !payersOf(sel).includes(id) && !payeesOf(sel).includes(id));
  const scoreText = (n: ProjectNode) => (n.score ? `${n.score.score} · ${t(`band.${n.score.band}`)}` : t("map.noScore"));
  const nodeLabel = (n: ProjectNode) => t("map.nodeLabel", { name: n.name, tier: t(TIER_KEYS[n.tier]!), score: scoreText(n) }) + (n.shared ? `, ${t("map.legendShared")}` : "");
  const red = map.nodes.filter((n) => n.score?.light === "RED").length;
  const yellow = map.nodes.filter((n) => n.score?.light === "YELLOW").length;
  const shared = map.nodes.filter((n) => n.shared).length;
  const cur = sel ? byId.get(sel) : null;
  const dRed = [...downstream].filter((id) => lightOf(id) === "RED").length;
  const dYellow = [...downstream].filter((id) => lightOf(id) === "YELLOW").length;

  if (map.nodes.length === 0) return <div className="empty"><h3>{t("map.emptyTitle")}</h3><p>{t("map.emptyBody")}</p></div>;

  return (
    <div className="stack">
      <div className="chain-stats" role="list">
        <div role="listitem"><b>{map.nodes.length}</b><span>{t("map.statCompanies")}</span></div>
        <div role="listitem"><b>{map.links.length}</b><span>{t("map.statLinks")}</span></div>
        <div role="listitem" className="bad"><b>{red}</b><span>{t("map.statRed")}</span></div>
        <div role="listitem" className="warn"><b>{shared}</b><span>{t("map.statShared")}</span></div>
      </div>
      <div className="mapbar">
        <p className="kicker" style={{ color: "var(--muted)" }}>{map.name} · {map.location}</p>
        <div className="btns"><button type="button" className="btn btn-line btn-sm" aria-pressed={cascade} onClick={() => setCascade((c) => !c)}>{t("map.cascade")}</button></div>
      </div>
      <div className="mapstatus" aria-live="polite">
        <div className="cnts">
          <div className="cnt bad"><b>{cascade && cur ? dRed : red}</b><span>{t("map.statRed")}</span></div>
          <div className="cnt warn"><b>{cascade && cur ? dYellow : yellow}</b><span>{t("map.statYellow")}</span></div>
        </div>
        <p>{cascade ? (cur ? (downstream.size ? t("map.cascadeMsg", { name: cur.name, n: downstream.size, red: dRed, yellow: dYellow }) : t("map.cascadeNone", { name: cur.name })) : t("map.cascadeHint")) : t("map.idleHint")}</p>
      </div>
      <div className="chain-map">
        <div className="map-scroll" tabIndex={0} role="region" aria-label={t("map.region", { name: map.name })}>
          <div className="map" ref={mapRef} onMouseLeave={() => setPrev(null)}>
            <svg className="map-edges" aria-hidden="true" viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}>
              {map.links.map((l, i) => {
                const on = !sel || (cascade ? l.payer === sel || downstream.has(l.payer) : l.payer === sel || l.payee === sel);
                return <path key={`${l.payer}-${l.payee}`} ref={(el) => { pathRefs.current[i] = el; }} d={paths[i] || "M0 0"} className={`edge ${lightOf(l.payer)} ${on ? (sel ? "hot" : "") : "dim"}`} />;
              })}
              <g className="arrows">{map.links.map((l, i) => <path key={i} ref={(el) => { arrowRefs.current[i] = el; }} d="M-6 -5L6 0L-6 5z" className={lightOf(l.payer)} visibility="hidden" />)}</g>
            </svg>
            {tiers.map((nodes, ti) => (
              <div className="mt" key={ti}>
                <p className="mt-label"><b>{t("map.tierN", { n: ti })}</b>{t(TIER_KEYS[ti]!)}</p>
                <div className="mt-nodes">
                  {nodes.length === 0 ? <span className="mt-empty">—</span> : nodes.map((n) => (
                    <button key={n.companyId} type="button" ref={(el) => { if (el) nodeRefs.current.set(n.companyId, el); else nodeRefs.current.delete(n.companyId); }}
                      className={`mn ${n.shared ? "is-shared" : ""} ${dimNode(n.companyId) ? "dim" : ""} ${cascade && downstream.has(n.companyId) ? "down" : ""} ${cascade && sel === n.companyId ? "src" : ""}`}
                      data-l={n.score?.light ?? "NONE"} aria-pressed={pin === n.companyId} aria-label={nodeLabel(n)}
                      onMouseEnter={() => setPrev(n.companyId)} onFocus={() => setPrev(n.companyId)} onBlur={() => setPrev(null)} onClick={() => toggle(n.companyId)}>
                      {n.shared && <span className="shared">{t("map.sharedBadge", { n: payersOf(n.companyId).length })}</span>}
                      <span className="ps">{n.score ? t(`light.${n.score.light}`) : t("light.none")}</span>
                      <span className="nm">{n.name}</span>
                      <span className="row"><span className={`sc ${n.score ? "" : "none"}`}>{n.score ? n.score.score : t("map.noScore")}</span>{n.roleLabel && <span className="small muted" style={{ fontSize: ".66rem" }}>{n.roleLabel}</span>}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="chain-list" aria-label={t("map.listLabel", { name: map.name })}>
        <div className="tiers">
          {tiers.map((nodes, ti) => nodes.length > 0 && (
            <div className="tier" key={ti}>
              <h3>{t("map.tierN", { n: ti })} · {t(TIER_KEYS[ti]!)}</h3>
              <ul>{nodes.map((n) => (
                <li key={n.companyId}>
                  <button type="button" className={`node ${n.shared ? "sh" : ""} ${dimNode(n.companyId) ? "dim" : ""}`} data-l={n.score?.light ?? "NONE"} aria-pressed={pin === n.companyId} aria-label={nodeLabel(n)} onClick={() => toggle(n.companyId)}>
                    <b>{n.name}</b><span className="s">{n.score ? n.score.score : "—"}</span>
                    <small>{n.roleLabel ?? ""}{n.shared ? ` · ${t("map.sharedBadge", { n: payersOf(n.companyId).length })}` : ""}</small>
                    <small className="pt">{n.score ? t(`light.${n.score.light}`) : t("light.none")}</small>
                  </button>
                </li>
              ))}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="map-foot">
        {cur ? (
          <div className="inspect" aria-live="polite">
            <div className="i-main">
              <p className="k">{t("map.selected")}</p>
              <p className="nm">{cur.name} <span className="id-chip ltr">{cur.tmcId}</span></p>
              <dl>
                <div><dt>{t("map.tier")}</dt><dd>{t("map.tierN", { n: cur.tier })}</dd></div>
                <div><dt>{t("map.score")}</dt><dd>{cur.score ? <BandChip band={cur.score.band} score={cur.score.score} t={t} /> : t("map.noScore")}</dd></div>
                <div><dt>{t("map.light")}</dt><dd><TrafficLight light={cur.score?.light ?? null} t={t} small /></dd></div>
                <div><dt>{t("map.role")}</dt><dd>{cur.roleLabel ?? "—"}</dd></div>
              </dl>
              <Link className="link small" href={`/check/${cur.companyId}`}>{t("map.openCard")}</Link>
            </div>
            <div className="i-side">
              <p className="i-why">
                {payersOf(cur.companyId).length ? t("map.paidBy", { names: list(payersOf(cur.companyId)) }) : t("map.topOfChain")}{" "}
                {payeesOf(cur.companyId).length ? t("map.pays", { names: list(payeesOf(cur.companyId)) }) : t("map.endOfChain")}
              </p>
              {cur.shared && <p className="i-shared">{t("map.sharedNote", { name: cur.name, n: payersOf(cur.companyId).length, names: list(payersOf(cur.companyId)) })}</p>}
              {downstream.size > 0 && <p className="i-cascade">{t("map.cascadeMsg", { name: cur.name, n: downstream.size, red: dRed, yellow: dYellow })}</p>}
            </div>
          </div>
        ) : <p className="inspect muted small">{t("map.idleHint")}</p>}
      </div>
      <p className="flowline">{t("map.flow")}</p>
      <ul className="legend">
        <li><i style={{ ["--c" as string]: "var(--ok)" }} />{t("map.legendGreen")}</li>
        <li><i style={{ ["--c" as string]: "var(--warn)" }} />{t("map.legendYellow")}</li>
        <li><i style={{ ["--c" as string]: "var(--bad)" }} />{t("map.legendRed")}</li>
        <li><i style={{ ["--c" as string]: "var(--line-strong)" }} />{t("map.legendGrey")}</li>
        <li><i className="ln" style={{ ["--c" as string]: "var(--line-strong)" }} />{t("map.legendLink")}</li>
        <li><i className="shared-i" />{t("map.legendShared")}</li>
        <li>{t("map.legendArrows")}</li>
      </ul>
    </div>
  );
}
