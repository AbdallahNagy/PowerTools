import axios from "axios";

export function toBulkWorkflowError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "The bulk workflow request failed.";
}
