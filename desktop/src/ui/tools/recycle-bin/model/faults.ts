import axios from "axios";
import type { RestoreResult, Source } from "./types";

export interface RecycleBinError {
  status: number | null;
  code: string | null;
  message: string;
}

/** Plain-language text for the per-record codes the sidecar returns. */
const RESTORE_MESSAGES: Record<string, string> = {
  DuplicateRecord: "A record with this ID already exists.",
  DuplicateKey: "A record with the same key values already exists. Delete or change that record first.",
  RelatedRecordMissing: "A related record this one points to no longer exists. Restore that record first.",
  ChoiceValueRemoved: "A choice option this record used has been removed. Add the option back first.",
  NotInRecycleBin: "This record is no longer in the recycle bin.",
  PrivilegeDenied: "You do not have permission to restore this record.",
  InRecycleBin: "This record is in the recycle bin. Restore it from there so every field comes back.",
  NoAuditedValues: "The audit log holds no field values for this record, so it cannot be restored.",
  TableNotRestorable: "Records of this table cannot be recreated from the audit log.",
  ServiceProtection: "Dataverse is limiting requests right now. Try again in a few minutes.",
};

const FALLBACK = "The record could not be restored.";

/** The Detail column text for one restore result. */
export function restoreDetail(result: RestoreResult): string {
  if (result.status === "restored") return result.warning ?? "";
  if (result.code === "PluginError") {
    return result.message ? `A plug-in stopped the restore: ${result.message}` : FALLBACK;
  }
  if (result.code && RESTORE_MESSAGES[result.code]) return RESTORE_MESSAGES[result.code]!;
  return result.message?.trim() || FALLBACK;
}

export function toRecycleBinError(error: unknown): RecycleBinError {
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
    return { status, code: null, message: error.message || "The request failed." };
  }
  if (error instanceof Error && error.message.trim()) return { status: null, code: null, message: error.message };
  return { status: null, code: null, message: "The request failed." };
}

export function isPermissionError(error: unknown): boolean {
  return toRecycleBinError(error).status === 403;
}

/** Text for a failed read (tables, users, list, details). */
export function readErrorText(error: unknown, source: Source | null): string {
  const parsed = toRecycleBinError(error);
  if (parsed.status === 403) {
    return source === "bin"
      ? "You do not have permission to read the recycle bin in this environment."
      : "You do not have permission to read audit history in this environment.";
  }
  return parsed.message;
}
