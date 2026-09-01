import axios from "axios";

export const pluginRegistrationProblemCategories = [
  "validation",
  "dependency",
  "concurrency",
  "permission",
  "authentication",
  "dataverse",
  "communication",
  "verification",
  "unsupported",
] as const;

export type PluginRegistrationProblemCategory = typeof pluginRegistrationProblemCategories[number];

export interface PluginRegistrationProblem {
  category: PluginRegistrationProblemCategory;
  code: string;
  message: string;
  environment: string;
  component: string | null;
  correlationId: string | null;
  suggestedAction: string;
}

export const mutationOutcomes = [
  "succeededAndVerified",
  "rejectedBeforeCompletion",
  "reconciledAfterCommunicationFailure",
  "outcomeUncertain",
] as const;

export type MutationOutcomeKind = typeof mutationOutcomes[number];

export interface MutationOutcome {
  outcome: MutationOutcomeKind;
  targetId: string | null;
  problem: PluginRegistrationProblem | null;
}

export interface MutationFailureContext {
  phase: "read" | "execute";
  affectedComponentId?: string | null;
  retry?: () => void;
}

export type ReportMutationResult = (value: unknown, affectedComponentId?: string | null) => Promise<void>;
export type ReportMutationFailure = (error: unknown, context: MutationFailureContext) => Promise<void>;

const genericProblem: PluginRegistrationProblem = {
  category: "communication",
  code: "plugin_registration_request_failed",
  message: "The plug-in registration request could not be completed safely.",
  environment: "Unknown environment",
  component: null,
  correlationId: null,
  suggestedAction: "Refresh and inspect the current registration state before trying again.",
};

export function parsePluginRegistrationProblem(error: unknown): PluginRegistrationProblem {
  const value = axios.isAxiosError(error) ? error.response?.data : error;
  return parseProblemValue(value) ?? genericProblem;
}

export function parseMutationOutcome(value: unknown): MutationOutcome {
  const record = asRecord(value);
  const outcome = record && isOutcome(record.outcome) ? record.outcome : "outcomeUncertain";
  return {
    outcome,
    targetId: safeOptionalText(record?.targetId, 128),
    problem: parseProblemValue(record?.problem),
  };
}

function parseProblemValue(value: unknown): PluginRegistrationProblem | null {
  const record = asRecord(value);
  if (!record || !isCategory(record.category)) return null;
  const code = safeCode(record.code);
  const message = safeRequiredText(record.message, 500);
  const environment = safeRequiredText(record.environment, 200);
  const suggestedAction = safeRequiredText(record.suggestedAction, 500);
  if (!code || !message || !environment || !suggestedAction) return null;
  return {
    category: record.category,
    code,
    message,
    environment,
    component: safeOptionalText(record.component, 300),
    correlationId: safeOptionalText(record.correlationId, 128),
    suggestedAction,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isCategory(value: unknown): value is PluginRegistrationProblemCategory {
  return typeof value === "string" && pluginRegistrationProblemCategories.includes(value as PluginRegistrationProblemCategory);
}

function isOutcome(value: unknown): value is MutationOutcomeKind {
  return typeof value === "string" && mutationOutcomes.includes(value as MutationOutcomeKind);
}

function safeCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_.-]{1,100}$/i.test(value) ? value : null;
}

function safeRequiredText(value: unknown, maxLength: number): string | null {
  const text = safeOptionalText(value, maxLength);
  return text?.length ? text : null;
}

function safeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maxLength || hasUnsafeControlCharacter(value)) return null;
  return value.trim();
}

function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 && code !== 9 && code !== 10 && code !== 13;
  });
}
