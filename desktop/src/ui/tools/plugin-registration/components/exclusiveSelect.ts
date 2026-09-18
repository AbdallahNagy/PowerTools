import { useCallback, useEffect, useRef, useState } from "react";

const exclusiveListeners = new Set<(openedId: number) => void>();
let nextSelectId = 0;

export function closeExclusiveSelects() {
  for (const listener of exclusiveListeners) listener(-1);
}

export function useExclusiveOpen() {
  const id = useRef(0);
  if (id.current === 0) id.current = ++nextSelectId;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const listener = (openedId: number) => {
      if (openedId !== id.current) setOpen(false);
    };
    exclusiveListeners.add(listener);
    return () => { exclusiveListeners.delete(listener); };
  }, []);

  const setExclusiveOpen = useCallback((next: boolean) => {
    if (next) {
      for (const listener of exclusiveListeners) listener(id.current);
      setOpen(true);
      return;
    }
    setOpen(false);
  }, []);

  return [open, setExclusiveOpen] as const;
}
