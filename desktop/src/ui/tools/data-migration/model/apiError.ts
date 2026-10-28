import axios from "axios";

/** The sidecar's own message for a failed request, such as the Dataverse error. */
export function apiErrorText(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const { error: message } = data as { error?: unknown };
      if (typeof message === "string" && message.trim()) return message;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
