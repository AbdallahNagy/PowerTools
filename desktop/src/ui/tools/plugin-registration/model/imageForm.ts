import type { ImageDraftDto, ImageDto, StepDto } from "./contracts";

export const IMAGE_MESSAGE_PROPERTIES: Record<string, string> = {
  Create: "Id",
  Update: "Target",
  Delete: "Target",
  Assign: "Target",
  Merge: "Target",
  SetState: "EntityMoniker",
  SetStateDynamicEntity: "EntityMoniker",
  CreateMultiple: "Ids",
  UpdateMultiple: "Targets",
  DeliverIncoming: "EmailId",
  DeliverPromote: "EmailId",
  Send: "EmailId",
};

export interface ImageFormState {
  name: string;
  entityAlias: string;
  imageType: number;
  attributes: string[];
}

export function createImageForm(image?: ImageDto): ImageFormState {
  return {
    name: image?.name ?? "",
    entityAlias: image?.entityAlias ?? "Target",
    imageType: image?.imageType ?? 0,
    attributes: image?.attributes ?? [],
  };
}

export function toImageDraft(form: ImageFormState, stepId: string): ImageDraftDto {
  return {
    stepId,
    name: form.name.trim(),
    entityAlias: form.entityAlias.trim(),
    imageType: form.imageType,
    attributes: form.attributes,
  };
}

export function messagePropertyName(messageName: string): string | undefined {
  return IMAGE_MESSAGE_PROPERTIES[messageName];
}

export function allowedImageTypes(messageName: string, stage: number): number[] {
  let types = [0, 1, 2];
  if (messageName.toLowerCase() === "create") types = types.filter((type) => type === 1);
  if (stage === 10 || stage === 20) types = types.filter((type) => type === 0);
  return types;
}

export function defaultImageType(step: StepDto): number {
  const allowed = allowedImageTypes(step.messageName, step.stage);
  return allowed[0] ?? 0;
}
