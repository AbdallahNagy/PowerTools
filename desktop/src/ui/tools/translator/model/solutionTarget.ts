import type { ApplySolution, SolutionInfo, SolutionResult } from "./types";

export const DEFAULT_VERSION = "1.0.0.0";
const UNIQUE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VERSION = /^\d{1,9}(\.\d{1,9}){1,3}$/;
const HIDDEN = new Set(["default", "active"]);

/** The "Add changed components to a solution" choice in the Apply confirmation. */
export interface SolutionTargetDraft {
  enabled: boolean;
  mode: "existing" | "new";
  existing: string;
  friendlyName: string;
  uniqueName: string;
  /** False while the unique name still follows the display name. */
  uniqueNameEdited: boolean;
  publisherId: string;
  version: string;
}

export const EMPTY_SOLUTION_TARGET: SolutionTargetDraft = {
  enabled: false,
  mode: "existing",
  existing: "",
  friendlyName: "",
  uniqueName: "",
  uniqueNameEdited: false,
  publisherId: "",
  version: DEFAULT_VERSION,
};

/** Solutions components can be added to: visible, unmanaged, not Default or Active. */
export function targetSolutions(solutions: readonly SolutionInfo[]): SolutionInfo[] {
  return solutions.filter((solution) => !solution.isManaged && !HIDDEN.has(solution.uniqueName.toLowerCase()));
}

/** A unique name from a display name: letters, numbers, and underscores, not starting with a number. */
export function uniqueNameFrom(friendlyName: string): string {
  const cleaned = friendlyName.replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned) return "";
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Field errors, keyed by field. Empty when the target can be sent. */
export function solutionTargetErrors(draft: SolutionTargetDraft): Partial<Record<keyof SolutionTargetDraft, string>> {
  if (!draft.enabled) return {};
  if (draft.mode === "existing") return draft.existing ? {} : { existing: "Choose a solution." };

  const errors: Partial<Record<keyof SolutionTargetDraft, string>> = {};
  const unique = draft.uniqueName.trim();
  if (!draft.friendlyName.trim()) errors.friendlyName = "Enter a display name.";
  if (!unique) errors.uniqueName = "Enter a unique name.";
  else if (unique.length > 65) errors.uniqueName = "Use at most 65 characters.";
  else if (!UNIQUE_NAME.test(unique))
    errors.uniqueName = "Use letters, numbers, and underscores, and do not start with a number.";
  else if (HIDDEN.has(unique.toLowerCase())) errors.uniqueName = "This name is reserved.";
  if (!draft.publisherId) errors.publisherId = "Choose a publisher.";
  if (!VERSION.test(draft.version.trim())) errors.version = "Use a version like 1.0.0.0.";
  return errors;
}

export function toApplySolution(draft: SolutionTargetDraft): ApplySolution | undefined {
  if (!draft.enabled) return undefined;
  if (draft.mode === "existing") return { uniqueName: draft.existing };
  return {
    new: {
      friendlyName: draft.friendlyName.trim(),
      uniqueName: draft.uniqueName.trim(),
      publisherId: draft.publisherId,
      version: draft.version.trim(),
    },
  };
}

/** Adding to the solution ended in a state the user should see before the modal closes. */
export function solutionNeedsAttention(solution: SolutionResult | undefined): boolean {
  return solution?.status === "failed" || solution?.status === "partial";
}
