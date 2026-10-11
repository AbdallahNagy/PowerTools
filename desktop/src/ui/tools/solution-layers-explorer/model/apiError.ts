import axios from "axios";

export interface SolutionLayersError {
  status: number | null;
  code: string | null;
  message: string;
}

/** Problem codes the sidecar returns when a component has no Active layer above another layer. */
export const NOT_REMOVABLE_CODES = new Set(["NoActiveLayer", "OnlyActiveLayer", "NotActiveLayer"]);

const READ_PERMISSION = "You need System Customizer or System Administrator rights to read solution layers.";
const REMOVE_PERMISSION = "You need System Customizer or System Administrator rights to remove the Active layer.";
export const NO_LONGER_REMOVABLE = "This component no longer has an Active layer above another layer.";

export function toSolutionLayersError(error: unknown): SolutionLayersError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return { status, code: null, message: data };
    if (data && typeof data === "object") {
      const { message, code } = data as { message?: unknown; code?: unknown };
      if (typeof message === "string" && message.trim()) {
        return { status, code: typeof code === "string" ? code : null, message };
      }
    }
    return { status, code: null, message: error.message || "The solution layers request failed." };
  }

  if (error instanceof Error && error.message.trim()) {
    return { status: null, code: null, message: error.message };
  }
  return { status: null, code: null, message: "The solution layers request failed." };
}

export function isNotRemovable(error: SolutionLayersError): boolean {
  return error.status === 409 && error.code !== null && NOT_REMOVABLE_CODES.has(error.code);
}

/** Text for a failed component search or layer read. */
export function readErrorText(error: unknown): string {
  const parsed = toSolutionLayersError(error);
  return parsed.status === 403 ? READ_PERMISSION : parsed.message;
}

/** Text for a failed single removal. */
export function removeErrorText(error: SolutionLayersError): string {
  if (error.status === 403) return REMOVE_PERMISSION;
  if (isNotRemovable(error)) return NO_LONGER_REMOVABLE;
  return error.message;
}
