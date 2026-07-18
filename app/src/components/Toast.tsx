"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  msg: string;
  sig?: string;
}

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const icons: Record<Kind, React.ReactNode> = {
  success: <path d="M20 6 9 17l-5-5" />,
  error: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 5500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              {icons[t.kind]}
            </svg>
            <div className="toast-body">
              <div>{t.msg}</div>
              {t.sig && <span className="toast-sig">tx {t.sig.slice(0, 8)}…{t.sig.slice(-6)}</span>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
