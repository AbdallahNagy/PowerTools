import axios from "axios";
import type { FailureKind } from "./types";

export function toEarlyBoundGeneratorError(error: unknown): string {
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
  return "The request to generate code failed.";
}

/** Plain wording for the failures users can act on; otherwise the server's message. */
export function describeFailure(
  kind: FailureKind | null,
  message: string | null,
  environment: string | null,
): string {
  switch (kind) {
    case "folderAccess":
      return "You do not have permission to write to this folder.";
    case "connection":
      return environment
        ? `The connection to ${environment} was lost. Reconnect and select Generate again.`
        : "The connection to the environment was lost. Reconnect and select Generate again.";
    default:
      return message?.trim() || "Generation failed.";
  }
}
