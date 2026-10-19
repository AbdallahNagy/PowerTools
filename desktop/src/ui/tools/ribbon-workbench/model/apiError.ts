import axios from "axios";
import type { Problem } from "./types";

export function toRibbonError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "The environment did not answer in time. Retry, or check the connection.";
    }
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The request failed.";
}

/** Problems a publish request was rejected with, when validation failed on the sidecar. */
export function rejectedProblems(error: unknown): Problem[] | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { code?: unknown; problems?: unknown } | undefined;
  return data?.code === "validation_failed" && Array.isArray(data.problems) ? (data.problems as Problem[]) : null;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
