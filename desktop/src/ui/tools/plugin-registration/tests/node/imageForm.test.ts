import { describe, expect, it } from "vitest";
import {
  allowedImageTypes,
  createImageForm,
  messagePropertyName,
  toImageDraft,
} from "../../model/imageForm";

describe("imageForm", () => {
  it("maps create to Id and update to Target", () => {
    expect(messagePropertyName("Create")).toBe("Id");
    expect(messagePropertyName("Update")).toBe("Target");
  });

  it("limits create images to post-image", () => {
    expect(allowedImageTypes("Create", 40)).toEqual([1]);
    expect(allowedImageTypes("Update", 20)).toEqual([0]);
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
});
