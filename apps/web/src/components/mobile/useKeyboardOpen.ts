"use client";
/**
 * Marks <html data-kb="open"> while the on-screen keyboard is (very likely) open on a touch device.
 * mobile.css uses it to slide the tab bar away and to drop sticky action bars to the bottom edge.
 *
 * Heuristic (no scroll listeners): an editable element is focused on a coarse pointer AND either the
 * visual viewport shrank by > 120 px, or the focus happened < 700 ms ago (keyboard still animating in).
 * Android's "back" closes the keyboard but keeps focus; the visualViewport resize catches that.
 * Ref-counted so several components can call the hook safely.
 */
import { useEffect } from "react";

let users = 0;
let teardown: (() => void) | null = null;

const NON_TEXT = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image", "hidden"]);

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NON_TEXT.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

function start(): () => void {
  const root = document.documentElement;
  const coarse = window.matchMedia("(pointer: coarse)");
  const vv = window.visualViewport;
  let focusedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = () => {
    const editable = coarse.matches && isEditable(document.activeElement);
    const shrunk = vv ? window.innerHeight - vv.height > 120 : true;
    const open = editable && (shrunk || Date.now() - focusedAt < 700);
    if (open) root.dataset.kb = "open";
    else delete root.dataset.kb;
  };
  const onFocusIn = (e: FocusEvent) => {
    if (!isEditable(e.target as Element)) return update();
    focusedAt = Date.now();
    update();
    clearTimeout(timer);
    timer = setTimeout(update, 750);
  };
  const onFocusOut = () => {
    // focus may move straight to another field; decide on the next frame
    requestAnimationFrame(update);
  };

  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  vv?.addEventListener("resize", update);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    vv?.removeEventListener("resize", update);
    delete root.dataset.kb;
  };
}

export function useKeyboardOpen(): void {
  useEffect(() => {
    users += 1;
    if (users === 1) teardown = start();
    return () => {
      users -= 1;
      if (users === 0) {
        teardown?.();
        teardown = null;
      }
    };
  }, []);
}
