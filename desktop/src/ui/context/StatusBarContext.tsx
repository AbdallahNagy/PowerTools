import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface StatusItem {
  id: string;
  content: ReactNode;
}

interface StatusBarContextType {
  items: StatusItem[];
  setStatus: (id: string, content: ReactNode) => void;
  clearStatus: (id: string) => void;
}

const StatusBarContext = createContext<StatusBarContextType | undefined>(
  undefined
);

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

  return (
    <StatusBarContext.Provider value={{ items, setStatus, clearStatus }}>
      {children}
    </StatusBarContext.Provider>
  );
}

export function useStatusBar() {
  const ctx = useContext(StatusBarContext);
  if (!ctx)
    throw new Error("useStatusBar must be used within StatusBarProvider");
  return ctx;
}
