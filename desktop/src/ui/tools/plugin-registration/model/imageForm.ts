import type { ImageDraftDto, ImageDto, RegistrationProblem, StepDto } from "./contracts";
import { STAGE_POST_OPERATION } from "./stepForm";

export const IMAGE_PRE = 0;
export const IMAGE_POST = 1;
export const IMAGE_BOTH = 2;
export const STAGE_POST_OPERATION_DEPRECATED = 50;

const CREATE_MESSAGES = new Set(["create", "createmultiple"]);
const DELETE_MESSAGES = new Set(["delete"]);

export interface ImageTypeFlags {
  pre: boolean;
  post: boolean;
}

export interface ImageFormState {
  name: string;
  entityAlias: string;
  preImage: boolean;
  postImage: boolean;
  attributes: string[];
}

export function imageTypeFlags(imageType: number): ImageTypeFlags {
  return {
    pre: imageType === IMAGE_PRE || imageType === IMAGE_BOTH,
    post: imageType === IMAGE_POST || imageType === IMAGE_BOTH,
  };
}

export function imageTypeFromFlags(pre: boolean, post: boolean): number {
  if (pre && post) return IMAGE_BOTH;
  if (post) return IMAGE_POST;
  return IMAGE_PRE;
}

export function imageTypeAvailability(messageName: string, stage: number): ImageTypeFlags {
  const message = messageName.trim().toLowerCase();
  const isPostStage = stage === STAGE_POST_OPERATION || stage === STAGE_POST_OPERATION_DEPRECATED;
  return {
    pre: !CREATE_MESSAGES.has(message),
    post: isPostStage && !DELETE_MESSAGES.has(message),
  };
}

export function clampImageTypeFlags(
  flags: ImageTypeFlags,
  availability: ImageTypeFlags,
): ImageTypeFlags {
  return {
    pre: flags.pre && availability.pre,
    post: flags.post && availability.post,
  };
}

export function defaultImageTypeFlags(availability: ImageTypeFlags): ImageTypeFlags {
  if (availability.pre) return { pre: true, post: false };
  if (availability.post) return { pre: false, post: true };
  return { pre: false, post: false };
}

export function createImageForm(
  image?: ImageDto,
  step?: Pick<StepDto, "messageName" | "stage">,
): ImageFormState {
  const availability = step
    ? imageTypeAvailability(step.messageName, step.stage)
    : { pre: true, post: true };
  const requested = image
    ? imageTypeFlags(image.imageType)
    : step
      ? defaultImageTypeFlags(availability)
      : { pre: true, post: false };
  const flags = clampImageTypeFlags(requested, availability);
  return {
    name: image?.name ?? "",
    entityAlias: image?.entityAlias ?? "Target",
    preImage: flags.pre,
    postImage: flags.post,
    attributes: image?.attributes ?? [],
  };
}

export function toImageDraft(form: ImageFormState, stepId: string): ImageDraftDto {
  return {
    stepId,
    name: form.name.trim(),
    entityAlias: form.entityAlias.trim(),
    imageType: imageTypeFromFlags(form.preImage, form.postImage),
    attributes: form.attributes,
  };
}

export function imageTypeSelectionProblem(
  form: ImageFormState,
): RegistrationProblem | undefined {
  if (form.preImage || form.postImage) return undefined;
  return {
    field: "imageType",
    code: "required",
    message: "Select at least one image type.",
  };
}

export function attributesSummary(count: number): string {
  if (count === 0) return "None selected";
  return `${count} selected`;
}
