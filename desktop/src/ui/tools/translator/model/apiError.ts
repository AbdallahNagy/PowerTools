import axios from "axios";

export function toTranslatorError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      const seconds = typeof error.config?.timeout === "number" ? Math.round(error.config.timeout / 1000) : null;
      return seconds
        ? `The environment did not answer within ${seconds} seconds. Retry, or check the connection.`
        : "The environment did not answer in time. Retry, or check the connection.";
    }
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "The translator request failed.";
}
