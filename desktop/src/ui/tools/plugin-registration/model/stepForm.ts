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

export const STAGE_PRE_VALIDATION = 10;
export const STAGE_PRE_OPERATION = 20;
export const STAGE_POST_OPERATION = 40;
export const MODE_SYNCHRONOUS = 0;
export const MODE_ASYNCHRONOUS = 1;
export const DEPLOYMENT_SERVER = 0;
export const DEPLOYMENT_OFFLINE = 1;
export const DEPLOYMENT_BOTH = 2;

export interface StepFormState {
  name: string;
  pluginTypeId: string;
  messageId: string;
  filterId: string;
  primaryEntity: string;
  secondaryEntity: string;
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
    primaryEntity: entityValue(step?.primaryEntity),
    secondaryEntity: entityValue(step?.secondaryEntity),
    stage: step?.stage ?? STAGE_POST_OPERATION,
    mode: step?.mode ?? MODE_SYNCHRONOUS,
    rank: step?.rank ?? 1,
    supportedDeployment: step?.supportedDeployment ?? DEPLOYMENT_SERVER,
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

export function isNoneEntity(value: string | null | undefined): boolean {
  return !value || value.trim().toLowerCase() === "none";
}

export function entityValue(value: string | null | undefined): string {
  return isNoneEntity(value) ? "" : value!.trim();
}

export function filteringAttributesEnabled(
  messageName: string,
  primaryEntity: string,
): boolean {
  return messageSupportsFilteringAttributes(messageName) && !isNoneEntity(primaryEntity);
}

export function asyncModeAllowed(stage: number): boolean {
  return stage === STAGE_POST_OPERATION;
}

export function preStageAllowed(mode: number): boolean {
  return mode === MODE_SYNCHRONOUS;
}

export function asyncAutoDeleteEnabled(mode: number): boolean {
  return mode === MODE_ASYNCHRONOUS;
}

export function filterLabel(filter: {
  primaryEntity: string | null;
  secondaryEntity: string | null;
}): string {
  const primary = isNoneEntity(filter.primaryEntity) ? "none" : filter.primaryEntity!;
  const secondary = isNoneEntity(filter.secondaryEntity) ? "" : filter.secondaryEntity!;
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
        id: current.id,
        messageId,
        primaryEntity: current.primaryEntity,
        secondaryEntity: current.secondaryEntity,
        availability: 0,
        unavailable: true as const,
      },
      ...filters,
    ];
  }
  return filters;
}

function sameEntity(left: string | null | undefined, right: string | null | undefined): boolean {
  return entityValue(left).toLowerCase() === entityValue(right).toLowerCase();
}

export function resolveFilterId(
  options: StepOptionsDto | undefined,
  messageId: string,
  primaryEntity: string,
  secondaryEntity: string,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): string {
  const filters = filtersForMessage(options, messageId, current);
  const match = filters.find(
    (filter) =>
      sameEntity(filter.primaryEntity, primaryEntity) &&
      sameEntity(filter.secondaryEntity, secondaryEntity),
  );
  return match?.id ?? "";
}

export function primaryEntitiesForMessage(
  options: StepOptionsDto | undefined,
  messageId: string,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): string[] {
  const names = new Set<string>();
  for (const filter of filtersForMessage(options, messageId, current)) {
    const name = entityValue(filter.primaryEntity);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function secondaryEntitiesForPrimary(
  options: StepOptionsDto | undefined,
  messageId: string,
  primaryEntity: string,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): string[] {
  const names = new Set<string>();
  for (const filter of filtersForMessage(options, messageId, current)) {
    if (!sameEntity(filter.primaryEntity, primaryEntity)) continue;
    const name = entityValue(filter.secondaryEntity);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function withResolvedFilter(
  form: StepFormState,
  options: StepOptionsDto | undefined,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): StepFormState {
  return {
    ...form,
    filterId: resolveFilterId(
      options,
      form.messageId,
      form.primaryEntity,
      form.secondaryEntity,
      current,
    ),
  };
}

export function selectMessage(
  form: StepFormState,
  messageId: string,
  options: StepOptionsDto | undefined,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): StepFormState {
  return withResolvedFilter(
    {
      ...form,
      messageId,
      primaryEntity: "",
      secondaryEntity: "",
      filteringAttributes: [],
    },
    options,
    current,
  );
}

export function selectPrimaryEntity(
  form: StepFormState,
  primaryEntity: string,
  options: StepOptionsDto | undefined,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): StepFormState {
  return withResolvedFilter(
    {
      ...form,
      primaryEntity,
      secondaryEntity: "",
      filteringAttributes: [],
    },
    options,
    current,
  );
}

export function selectSecondaryEntity(
  form: StepFormState,
  secondaryEntity: string,
  options: StepOptionsDto | undefined,
  current?: { id: string; primaryEntity: string | null; secondaryEntity: string | null },
): StepFormState {
  return withResolvedFilter(
    {
      ...form,
      secondaryEntity,
    },
    options,
    current,
  );
}

export function selectStage(form: StepFormState, stage: number): StepFormState {
  if (!preStageAllowed(form.mode) && stage !== STAGE_POST_OPERATION) return form;
  return { ...form, stage };
}

export function selectMode(form: StepFormState, mode: number): StepFormState {
  if (mode === MODE_ASYNCHRONOUS && !asyncModeAllowed(form.stage)) {
    return {
      ...form,
      mode,
      stage: STAGE_POST_OPERATION,
    };
  }
  if (mode === MODE_SYNCHRONOUS) {
    return { ...form, mode, asyncAutoDelete: false };
  }
  return { ...form, mode };
}

export function deploymentFlags(value: number): { server: boolean; offline: boolean } {
  return {
    server: value === DEPLOYMENT_SERVER || value === DEPLOYMENT_BOTH,
    offline: value === DEPLOYMENT_OFFLINE || value === DEPLOYMENT_BOTH,
  };
}

export function deploymentFromFlags(server: boolean, offline: boolean): number {
  if (server && offline) return DEPLOYMENT_BOTH;
  if (offline) return DEPLOYMENT_OFFLINE;
  return DEPLOYMENT_SERVER;
}

export function toggleDeployment(
  current: number,
  flag: "server" | "offline",
  checked: boolean,
): number {
  const flags = deploymentFlags(current);
  const next = { ...flags, [flag]: checked };
  if (!next.server && !next.offline) return current;
  return deploymentFromFlags(next.server, next.offline);
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
  return update ? selectMessage(form, update.id, options) : form;
}

export function filteringAttributesSummary(count: number): string {
  if (count === 0) return "None selected";
  return `${count} selected`;
}
