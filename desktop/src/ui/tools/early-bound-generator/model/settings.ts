import type { FormSettings, GenerationRequest, LoadedSettings } from "./types";

/** Defaults: Microsoft's folder names, and messages off until a message filter is entered. */
export const DEFAULT_SETTINGS: FormSettings = {
  namespace: "DataverseModel",
  serviceContextName: "DataverseContext",
  entityTypesFolder: "Entities",
  optionSetsTypesFolder: "OptionSets",
  messagesTypesFolder: "Messages",
  tablesText: "",
  messagesText: "",
  generateMessages: false,
  generateGlobalOptionSets: false,
  emitFieldsClasses: false,
  emitVirtualAttributes: true,
  emitEntityETC: false,
  suppressINotifyPattern: false,
  suppressGeneratedCodeAttribute: true,
};

const NAMESPACE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_OR_PATTERN = /^[A-Za-z0-9_*%]+$/;

export const NAMESPACE_ERROR = "Enter a valid C# namespace, such as Contoso.Model.";
export const FOLDER_ERROR = "Enter a folder name relative to the output folder, without .. or a drive.";

/** Non-empty trimmed lines. Commas and semicolons also separate names. */
export function parseLines(text: string): string[] {
  return text
    .split(/[\r\n,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isPattern(entry: string): boolean {
  return entry.includes("*") || entry.includes("%");
}

function patternToRegExp(pattern: string): RegExp {
  const body = pattern
    .toLowerCase()
    .split(/[*%]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

export interface TableExpansion {
  /** Explicit logical names, in entry order, without duplicates. */
  names: string[];
  /** Explicit names the environment does not have. */
  unknown: string[];
  /** Patterns that match no table. */
  emptyPatterns: string[];
  /** Entries with characters other than letters, digits, _, * and %. */
  invalid: string[];
  hasPatterns: boolean;
}

/**
 * Expands `*` and `%` against the environment's table names. pac matches table names exactly,
 * so only explicit names go to the engine and into builderSettings.json.
 * Without a table list, patterns stay unexpanded and names are not checked.
 */
export function expandTables(text: string, knownTables: readonly string[] | null): TableExpansion {
  const entries = parseLines(text).map((entry) => entry.toLowerCase());
  const known = knownTables ? new Set(knownTables.map((name) => name.toLowerCase())) : null;
  const names: string[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  const emptyPatterns: string[] = [];
  const invalid: string[] = [];

  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const entry of entries) {
    if (!NAME_OR_PATTERN.test(entry)) {
      invalid.push(entry);
      continue;
    }
    if (!isPattern(entry)) {
      if (known && !known.has(entry)) unknown.push(entry);
      add(entry);
      continue;
    }
    if (!knownTables) {
      add(entry);
      continue;
    }
    const regex = patternToRegExp(entry);
    const matches = [...knownTables].map((name) => name.toLowerCase()).filter((name) => regex.test(name)).sort();
    if (matches.length === 0) emptyPatterns.push(entry);
    matches.forEach(add);
  }

  return { names, unknown, emptyPatterns, invalid, hasPatterns: entries.some(isPattern) };
}

/** Message names keep their case; `%` is written as pac's `*`. */
export function parseMessages(text: string): { names: string[]; invalid: string[] } {
  const names: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of parseLines(text)) {
    if (!NAME_OR_PATTERN.test(entry)) {
      invalid.push(entry);
      continue;
    }
    const name = entry.replace(/%/g, "*");
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return { names, invalid };
}

export function isSafeRelativeFolder(folder: string): boolean {
  const trimmed = folder.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return false;
  if (/^[\\/]/.test(trimmed) || trimmed.includes(":")) return false;
  if (/[<>"|?*]/.test(trimmed)) return false;
  const segments = trimmed.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 && segments.every((segment) => segment !== ".." && segment !== ".");
}

export type SettingsErrors = Partial<
  Record<
    | "namespace"
    | "serviceContextName"
    | "entityTypesFolder"
    | "optionSetsTypesFolder"
    | "messagesTypesFolder"
    | "tables"
    | "messages",
    string
  >
>;

function list(values: readonly string[]): string {
  return values.join(", ");
}

/** The same rules the sidecar applies before it queues a run, worded for the form. */
export function validateSettings(settings: FormSettings, tables: TableExpansion): SettingsErrors {
  const errors: SettingsErrors = {};
  const namespace = settings.namespace.trim();
  const context = settings.serviceContextName.trim();

  if (!NAMESPACE.test(namespace)) errors.namespace = NAMESPACE_ERROR;

  if (context) {
    if (!IDENTIFIER.test(context)) {
      errors.serviceContextName = "Enter a valid C# class name, such as DataverseContext.";
    } else if (context === namespace) {
      errors.serviceContextName = "The service context name must differ from the namespace.";
    }
  } else if (settings.generateMessages) {
    errors.serviceContextName = "Message classes need the service context. Enter a service context name.";
  }

  for (const key of ["entityTypesFolder", "optionSetsTypesFolder", "messagesTypesFolder"] as const) {
    if (!isSafeRelativeFolder(settings[key])) errors[key] = FOLDER_ERROR;
  }

  if (tables.invalid.length > 0) {
    errors.tables = `Use only letters, digits, underscores, and * or %: ${list(tables.invalid)}.`;
  } else if (tables.unknown.length > 0) {
    errors.tables = `Not found in this environment: ${list(tables.unknown)}.`;
  } else if (tables.emptyPatterns.length > 0) {
    errors.tables = `No table matches: ${list(tables.emptyPatterns)}.`;
  }

  if (settings.generateMessages) {
    const messages = parseMessages(settings.messagesText);
    if (messages.invalid.length > 0) {
      errors.messages = `Use only letters, digits, underscores, and * or %: ${list(messages.invalid)}.`;
    }
  }

  return errors;
}

export function hasErrors(errors: SettingsErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function toGenerationRequest(
  outputDirectory: string,
  settings: FormSettings,
  tables: TableExpansion,
): GenerationRequest {
  return {
    outputDirectory,
    namespace: settings.namespace.trim(),
    serviceContextName: settings.serviceContextName.trim(),
    entityTypesFolder: settings.entityTypesFolder.trim(),
    optionSetsTypesFolder: settings.optionSetsTypesFolder.trim(),
    messagesTypesFolder: settings.messagesTypesFolder.trim(),
    entityNamesFilter: tables.names,
    // A message filter with messages off would still make the engine generate messages.
    messageNamesFilter: settings.generateMessages ? parseMessages(settings.messagesText).names : [],
    generateMessages: settings.generateMessages,
    generateGlobalOptionSets: settings.generateGlobalOptionSets,
    emitFieldsClasses: settings.emitFieldsClasses,
    emitVirtualAttributes: settings.emitVirtualAttributes,
    emitEntityETC: settings.emitEntityETC,
    suppressINotifyPattern: settings.suppressINotifyPattern,
    suppressGeneratedCodeAttribute: settings.suppressGeneratedCodeAttribute,
  };
}

/** Values found in builderSettings.json replace the form's; missing values keep the form's. */
export function applyLoadedSettings(current: FormSettings, loaded: LoadedSettings): FormSettings {
  const pick = <T,>(value: T | null | undefined, fallback: T): T => (value ?? fallback);
  return {
    namespace: pick(loaded.namespace, current.namespace),
    serviceContextName: pick(loaded.serviceContextName, current.serviceContextName),
    entityTypesFolder: pick(loaded.entityTypesFolder, current.entityTypesFolder),
    optionSetsTypesFolder: pick(loaded.optionSetsTypesFolder, current.optionSetsTypesFolder),
    messagesTypesFolder: pick(loaded.messagesTypesFolder, current.messagesTypesFolder),
    tablesText: loaded.entityNamesFilter ? loaded.entityNamesFilter.join("\n") : current.tablesText,
    messagesText: loaded.messageNamesFilter ? loaded.messageNamesFilter.join("\n") : current.messagesText,
    generateMessages: pick(loaded.generateSdkMessages, current.generateMessages),
    generateGlobalOptionSets: pick(loaded.generateGlobalOptionSets, current.generateGlobalOptionSets),
    emitFieldsClasses: pick(loaded.emitFieldsClasses, current.emitFieldsClasses),
    emitVirtualAttributes: pick(loaded.emitVirtualAttributes, current.emitVirtualAttributes),
    emitEntityETC: pick(loaded.emitEntityETC, current.emitEntityETC),
    suppressINotifyPattern: pick(loaded.suppressINotifyPattern, current.suppressINotifyPattern),
    suppressGeneratedCodeAttribute: pick(loaded.suppressGeneratedCodeAttribute, current.suppressGeneratedCodeAttribute),
  };
}
