import { describe, expect, it } from "vitest";
import type { ImageDto } from "../../model/contracts";
import {
  attributesSummary,
  createImageForm,
  imageTypeAvailability,
  imageTypeFromFlags,
  imageTypeSelectionProblem,
  toImageDraft,
} from "../../model/imageForm";

function image(overrides: Partial<ImageDto> = {}): ImageDto {
  return {
    id: "image-1",
    stepId: "step-1",
    name: "PreImage",
    entityAlias: "Target",
    imageType: 0,
    attributes: ["name"],
    messagePropertyName: "Target",
    isManaged: false,
    isSystem: false,
    ...overrides,
  };
}

describe("imageForm", () => {
  it("allows pre and post from message and stage", () => {
    expect(imageTypeAvailability("Create", 40)).toEqual({ pre: false, post: true });
    expect(imageTypeAvailability("Create", 20)).toEqual({ pre: false, post: false });
    expect(imageTypeAvailability("CreateMultiple", 40)).toEqual({ pre: false, post: true });
    expect(imageTypeAvailability("Delete", 40)).toEqual({ pre: true, post: false });
    expect(imageTypeAvailability("Delete", 10)).toEqual({ pre: true, post: false });
    expect(imageTypeAvailability("Update", 20)).toEqual({ pre: true, post: false });
    expect(imageTypeAvailability("Update", 40)).toEqual({ pre: true, post: true });
    expect(imageTypeAvailability("Assign", 40)).toEqual({ pre: true, post: true });
  });

  it("encodes pre and post checkboxes as 0, 1, or 2", () => {
    expect(imageTypeFromFlags(true, false)).toBe(0);
    expect(imageTypeFromFlags(false, true)).toBe(1);
    expect(imageTypeFromFlags(true, true)).toBe(2);
  });

  it("defaults a new image to pre when allowed, otherwise post", () => {
    expect(createImageForm(undefined, { messageName: "Update", stage: 40 })).toMatchObject({
      preImage: true,
      postImage: false,
    });
    expect(createImageForm(undefined, { messageName: "Create", stage: 40 })).toMatchObject({
      preImage: false,
      postImage: true,
    });
    expect(createImageForm(undefined, { messageName: "Delete", stage: 40 })).toMatchObject({
      preImage: true,
      postImage: false,
    });
  });

  it("clamps stored both-type onto delete as pre only", () => {
    expect(
      createImageForm(image({ imageType: 2 }), { messageName: "Delete", stage: 40 }),
    ).toMatchObject({
      preImage: true,
      postImage: false,
    });
  });

  it("builds a draft from the form", () => {
    const form = createImageForm();
    form.name = "PreImage";
    form.attributes = ["name"];
    expect(toImageDraft(form, "step-1")).toEqual({
      stepId: "step-1",
      name: "PreImage",
      entityAlias: "Target",
      imageType: 0,
      attributes: ["name"],
    });
  });

  it("builds a both-type draft when both checkboxes are on", () => {
    const form = createImageForm();
    form.preImage = true;
    form.postImage = true;
    expect(toImageDraft(form, "step-1").imageType).toBe(2);
  });

  it("requires at least one image type", () => {
    const form = createImageForm();
    form.preImage = false;
    form.postImage = false;
    expect(imageTypeSelectionProblem(form)?.code).toBe("required");
    expect(imageTypeSelectionProblem(createImageForm())).toBeUndefined();
  });

  it("summarizes selected attributes", () => {
    expect(attributesSummary(0)).toBe("None selected");
    expect(attributesSummary(3)).toBe("3 selected");
  });
});
