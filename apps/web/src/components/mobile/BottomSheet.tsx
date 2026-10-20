"use client";
/**
 * Accessible modal: bottom sheet on phones (< 768 px), centred dialog from 768 px.
 *
 * Built on native <dialog>.showModal(): the rest of the page becomes inert (focus is trapped),
 * Esc fires `cancel`, focus returns to the opener on close, and the dialog renders in the top layer
 * (no z-index fights with sticky headers / the tab bar). Scroll locking is pure CSS
 * (`html:has(.m-sheet[open]) { overflow: hidden }` + `scrollbar-gutter: stable`), so the page never
 * jumps and keeps its scroll position (no `body { position: fixed }` hack).
 *
 * Controlled: render it always and toggle `open`; `onClose` fires for Esc, backdrop tap, close button,
 * swipe-down, or a <form method="dialog"> inside.
 */
import { useEffect, useId, useRef, type ReactNode, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from "react";
import { MobileIcon } from "./icons";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Optional line under the title (becomes aria-describedby). */
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer for the sheet's actions (primary action last). Safe-area aware. */
  footer?: ReactNode;
  /** Accessible label for the close button (i18n, e.g. t("common.close")). */
  closeLabel: string;
  /** Hide the title visually (still announced). */
  hideTitle?: boolean;
  /** Tap on backdrop / swipe closes. Turn off for destructive flows with unsaved input. Esc always closes. */
  dismissible?: boolean;
  /** "auto" = height of content (max ~92 dvh); "full" = always tall (long forms). */
  size?: "auto" | "full";
  className?: string;
}

const SWIPE_CLOSE_PX = 96;
const SWIPE_CLOSE_VELOCITY = 0.55; // px per ms

export function BottomSheet({
  open, onClose, title, description, children, footer, closeLabel,
  hideTitle = false, dismissible = true, size = "auto", className,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descId = useId();
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);

  // open/close the native dialog from the prop
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.style.transform = "";
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Esc → cancel; <form method="dialog"> or external close → close
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // keep it controlled; the parent flips `open`
      onCloseRef.current();
    };
    const onNativeClose = () => onCloseRef.current();
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onNativeClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onNativeClose);
    };
  }, []);

  // close on unmount (route change while open)
  useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);

  const onBackdropClick = (e: RMouseEvent<HTMLDialogElement>) => {
    if (!dismissible || e.target !== ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) onClose();
  };

  // swipe-to-dismiss on the grab area + header only (never hijacks the scrolling body)
  const isPhone = () => window.matchMedia("(max-width: 767.98px)").matches;
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dismissible || !isPhone() || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as Element).closest("button, a, input, select, textarea")) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current?.setAttribute("data-dragging", "");
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId || !ref.current) return;
    g.dy = Math.max(0, e.clientY - g.y);
    ref.current.style.transform = `translate3d(0, ${g.dy}px, 0)`;
  };
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId || !ref.current) return;
    drag.current = null;
    ref.current.removeAttribute("data-dragging");
    const v = g.dy / Math.max(1, performance.now() - g.t);
    if (g.dy > SWIPE_CLOSE_PX || (g.dy > 24 && v > SWIPE_CLOSE_VELOCITY)) {
      ref.current.style.transform = "";
      onClose();
    } else {
      ref.current.style.transform = "";
    }
  };

  return (
    <dialog
      ref={ref}
      className={["m-sheet", className].filter(Boolean).join(" ")}
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={onBackdropClick}
    >
      <div
        className="m-sheet-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="m-sheet-handle" aria-hidden="true" />
        <div className="m-sheet-head">
          <div className="m-sheet-titles">
            <h2 id={titleId} className={hideTitle ? "sr" : undefined}>{title}</h2>
            {description ? <p id={descId}>{description}</p> : null}
          </div>
          <button type="button" className="m-sheet-close" onClick={onClose} aria-label={closeLabel}>
            <MobileIcon name="close" size={22} />
          </button>
        </div>
      </div>
      <div className="m-sheet-body">{children}</div>
      {footer ? <div className="m-sheet-foot">{footer}</div> : null}
    </dialog>
  );
}
