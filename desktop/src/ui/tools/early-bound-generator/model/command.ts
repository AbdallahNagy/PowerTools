import type { GenerationRequest } from "./types";

export const OUTPUT_FOLDER_PLACEHOLDER = "<output folder>";

/** Quotes a value for PowerShell and cmd when it has spaces or shell characters. Filters are always quoted. */
export function quoteArgument(value: string, always = false): string {
  if (!always && /^[A-Za-z0-9_.:\\/-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * The `pac modelbuilder build` command that reproduces a run. pac uses the same engine and always
 * writes one file per object; its own sign-in picks the environment.
 */
export function buildPacCommand(request: GenerationRequest): string {
  const parts = [
    "pac modelbuilder build",
    `--outdirectory ${quoteArgument(request.outputDirectory || OUTPUT_FOLDER_PLACEHOLDER)}`,
    `--namespace ${quoteArgument(request.namespace)}`,
  ];

  if (request.serviceContextName) parts.push(`--serviceContextName ${quoteArgument(request.serviceContextName)}`);
  parts.push(`--entitytypesfolder ${quoteArgument(request.entityTypesFolder)}`);
  parts.push(`--optionsetstypesfolder ${quoteArgument(request.optionSetsTypesFolder)}`);
  parts.push(`--messagestypesfolder ${quoteArgument(request.messagesTypesFolder)}`);
  if (request.entityNamesFilter.length > 0) {
    parts.push(`--entitynamesfilter ${quoteArgument(request.entityNamesFilter.join(";"), true)}`);
  }
  if (request.generateMessages) {
    parts.push("--generatesdkmessages");
    if (request.messageNamesFilter.length > 0) {
      parts.push(`--messagenamesfilter ${quoteArgument(request.messageNamesFilter.join(";"), true)}`);
    }
  }
  if (request.generateGlobalOptionSets) parts.push("--generateGlobalOptionSets");
  if (request.emitFieldsClasses) parts.push("--emitfieldsclasses");
  if (request.emitVirtualAttributes) parts.push("--emitvirtualattributes");
  if (request.emitEntityETC) parts.push("--emitentityetc");
  if (request.suppressINotifyPattern) parts.push("--suppressINotifyPattern");
  if (request.suppressGeneratedCodeAttribute) parts.push("--suppressGeneratedCodeAttribute");
  parts.push("--writesettingsTemplateFile");

  return parts.join(" ");
}
