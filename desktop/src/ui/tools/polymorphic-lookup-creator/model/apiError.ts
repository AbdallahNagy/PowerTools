import axios from "axios";

export function toLookupError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === "object") {
    const data = error.response.data as { message?: unknown; code?: unknown };
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.code === "string" && data.code.trim()) return data.code;
  }

  if (error instanceof Error && error.message) return error.message;
  return "The lookup request failed.";
}
