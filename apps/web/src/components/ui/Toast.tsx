"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";
interface ToastItem { id: number; kind: ToastKind; text: string }
const Ctx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, [dismiss]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            <span className="ic" aria-hidden="true">{x.kind === "success" ? "✓" : "!"}</span>
            <span>{x.text}</span>
            <button type="button" onClick={() => dismiss(x.id)} aria-label={closeLabel}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
