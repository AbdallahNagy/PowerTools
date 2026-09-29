import type { ExecuteFetchRequest } from "./types";

export const EMPTY_FETCH_MESSAGE =
  "Please provide a FetchXML query before trying to execute it.";

export function emptyFetchMessage(fetchXml: string): string | null {
  return fetchXml.trim().length === 0 ? EMPTY_FETCH_MESSAGE : null;
}

export function buildExecuteRequest(
  fetchXml: string,
  showFormatted: boolean,
): ExecuteFetchRequest {
  return {
    fetchXml,
    preserveFetchXml: true,
    valueMode: showFormatted ? "formatted" : "raw",
  };
}
