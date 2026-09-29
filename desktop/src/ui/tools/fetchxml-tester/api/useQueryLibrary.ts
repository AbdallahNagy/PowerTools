import { useCallback, useEffect, useState } from "react";
import {
  deleteQuery,
  loadQueries,
  QUERY_LIBRARY_CHANGED_EVENT,
  saveQuery,
  writeQueries,
  type SaveQueryInput,
  type SaveQueryResult,
} from "../model/queryLibrary";
import type { SavedQuery } from "../model/types";

export function useQueryLibrary() {
  const [queries, setQueries] = useState<SavedQuery[]>(() => loadQueries(localStorage));

  const refresh = useCallback(() => {
    setQueries(loadQueries(localStorage));
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener(QUERY_LIBRARY_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(QUERY_LIBRARY_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const persist = useCallback((next: SavedQuery[]) => {
    writeQueries(localStorage, next);
    window.dispatchEvent(new Event(QUERY_LIBRARY_CHANGED_EVENT));
  }, []);

  const save = useCallback((input: SaveQueryInput): SaveQueryResult => {
    const result = saveQuery(loadQueries(localStorage), input);
    if (!result.ok) return result;
    try {
      persist(result.queries);
    } catch {
      return { ok: false, error: "The query library could not be saved." };
    }
    return result;
  }, [persist]);

  const remove = useCallback((id: string) => {
    try {
      persist(deleteQuery(loadQueries(localStorage), id));
      return true;
    } catch {
      return false;
    }
  }, [persist]);

  const reload = useCallback(() => {
    try {
      refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  return { queries, save, remove, reload };
}
