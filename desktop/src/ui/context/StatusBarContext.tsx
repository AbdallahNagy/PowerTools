import { useCallback, useMemo, useState, type ReactNode } from "react";

import { StatusBarProviderContext, type StatusItem } from "./StatusBarProviderContext";

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StatusItem[]>([]);

  const setStatus = useCallback((id: string, content: ReactNode) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return [...prev, { id, content }];
      const next = [...prev];
      next[idx] = { id, content };
      return next;
    });
  }, []);

  const clearStatus = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const value = useMemo(
    () => ({ items, setStatus, clearStatus }),
    [items, setStatus, clearStatus]
  );

  return (
    <StatusBarProviderContext.Provider value={value}>
      {children}
    </StatusBarProviderContext.Provider>
  );
}
