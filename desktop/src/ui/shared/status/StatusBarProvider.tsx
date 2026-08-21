import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  StatusActionsContext,
  StatusContext,
  StatusItemsContext,
  type StatusItem,
} from "./StatusContext";

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StatusItem[]>([]);

  const setStatus = useCallback((id: string, content: ReactNode) => {
    setItems((previousItems) => {
      const index = previousItems.findIndex((item) => item.id === id);
      if (index === -1) return [...previousItems, { id, content }];

      const nextItems = [...previousItems];
      nextItems[index] = { id, content };
      return nextItems;
    });
  }, []);

  const clearStatus = useCallback((id: string) => {
    setItems((previousItems) => previousItems.filter((item) => item.id !== id));
  }, []);

  const actions = useMemo(() => ({ setStatus, clearStatus }), [setStatus, clearStatus]);
  const value = useMemo(
    () => ({ items, setStatus, clearStatus }),
    [items, setStatus, clearStatus],
  );

  return (
    <StatusActionsContext.Provider value={actions}>
      <StatusItemsContext.Provider value={items}>
        <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
      </StatusItemsContext.Provider>
    </StatusActionsContext.Provider>
  );
}
