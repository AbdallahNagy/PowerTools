import type {
  FilterOptionDto,
  StepDraftDto,
  StepDto,
  StepOptionsDto,
  UserOptionDto,
} from "./contracts";

export const FILTERING_ATTRIBUTE_MESSAGES = new Set([
  "Update",
  "Create",
  "CreateMultiple",
  "UpdateMultiple",
]);

export interface StepFormState {
  name: string;
  pluginTypeId: string;
  messageId: string;
  filterId: string;
  stage: number;
  mode: number;
  rank: number;
  supportedDeployment: number;
  asyncAutoDelete: boolean;
  filteringAttributes: string[];
  impersonatingUserId: string;
  description: string;
  configuration: string;
  secureConfigurationAction: "keep" | "replace" | "clear";
  secureConfiguration: string;
}

export function createStepForm(step?: StepDto, pluginTypeId?: string): StepFormState {
  return {
    name: step?.name ?? "",
    pluginTypeId: step?.pluginTypeId ?? pluginTypeId ?? "",
    messageId: step?.messageId ?? "",
    filterId: step?.filterId ?? "",
    stage: step?.stage ?? 40,
    mode: step?.mode ?? 0,
    rank: step?.rank ?? 1,
    supportedDeployment: step?.supportedDeployment ?? 0,
    asyncAutoDelete: step?.asyncAutoDelete ?? false,
    filteringAttributes: step?.filteringAttributes ?? [],
    impersonatingUserId: step?.impersonatingUserId ?? "",
    description: step?.description ?? "",
    configuration: step?.configuration ?? "",
    secureConfigurationAction: step ? "keep" : "keep",
    secureConfiguration: "",
  };
}

export function toStepDraft(form: StepFormState): StepDraftDto {
  return {
    name: form.name.trim(),
    pluginTypeId: form.pluginTypeId,
    messageId: form.messageId,
    filterId: form.filterId || null,
    stage: form.stage,
    mode: form.mode,
    rank: form.rank,
    supportedDeployment: form.supportedDeployment,
    asyncAutoDelete: form.asyncAutoDelete,
    filteringAttributes: form.filteringAttributes,
    impersonatingUserId: form.impersonatingUserId || null,
    description: form.description.trim() || null,
    configuration: form.configuration,
    secureConfigurationAction: form.secureConfigurationAction,
    secureConfiguration:
      form.secureConfigurationAction === "replace"
        ? form.secureConfiguration
        : null,
  };
}

export function messageSupportsFilteringAttributes(name: string): boolean {
  return FILTERING_ATTRIBUTE_MESSAGES.has(name);
}

export function filterLabel(filter: {
  primaryEntity: string | null;
  secondaryEntity: string | null;
}): string {
  const primary =
    !filter.primaryEntity || filter.primaryEntity.toLowerCase() === "none"
      ? "none"
      : filter.primaryEntity;
  const secondary =
    !filter.secondaryEntity || filter.secondaryEntity.toLowerCase() === "none"
      ? ""
      : filter.secondaryEntity;
  return secondary ? `${primary} (${secondary})` : primary;
}

export function filtersForMessage(
  options: StepOptionsDto | undefined,
  messageId: string,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): Array<FilterOptionDto & { unavailable?: boolean }> {
  const filters = (options?.filters ?? []).filter((filter) => filter.messageId === messageId);
  if (current?.id && !filters.some((filter) => filter.id === current.id)) {
    return [
      {
        ...{
          id: current.id,
          messageId,
          primaryEntity: current.primaryEntity,
          secondaryEntity: current.secondaryEntity,
          availability: 0,
        },
        unavailable: true as const,
      },
      ...filters,
    ];
  }
  return filters;
}

export function usersForSelect(
  options: StepOptionsDto | undefined,
  current?: { id: string; fullName: string | null },
): Array<UserOptionDto & { unavailable?: boolean }> {
  const users = [...(options?.users ?? [])];
  if (current?.id && !users.some((user) => user.id === current.id)) {
    return [
      { id: current.id, fullName: current.fullName || current.id, unavailable: true as const },
      ...users,
    ];
  }
  return users;
}

export function applyDefaultMessage(
  form: StepFormState,
  options: StepOptionsDto | undefined,
): StepFormState {
  if (form.messageId || !options) return form;
  const update = options.messages.find((message) => message.name === "Update");
  return update ? { ...form, messageId: update.id } : form;
}
