import axios from "axios";

export interface EnvironmentVariablesError {
  status: number | null;
  code: string | null;
  message: string;
}

const FALLBACK = "The environment variables request failed.";

export function toApiError(error: unknown): EnvironmentVariablesError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const data: unknown = error.response?.data;
    if (typeof data === "string" && data.trim()) return { status, code: null, message: data };
    if (data && typeof data === "object") {
      const { message, code } = data as { message?: unknown; code?: unknown };
      if (typeof message === "string" && message.trim()) {
        return { status, code: typeof code === "string" ? code : null, message };
      }
    }
    return { status, code: null, message: error.message || FALLBACK };
  }
  if (error instanceof Error && error.message.trim()) return { status: null, code: null, message: error.message };
  return { status: null, code: null, message: FALLBACK };
}

export function errorText(error: unknown): string {
  return toApiError(error).message;
}
