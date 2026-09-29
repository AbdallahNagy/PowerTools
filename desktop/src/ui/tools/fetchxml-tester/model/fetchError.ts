import axios from "axios";

export function fetchErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      return data.error;
    }
    return error.message;
  }

  if (error instanceof Error) return error.message;
  return "The FetchXML request failed.";
}
