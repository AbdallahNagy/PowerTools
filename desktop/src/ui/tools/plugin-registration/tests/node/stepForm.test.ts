import { describe, expect, it } from "vitest";
import {
  createStepForm,
  filterLabel,
  filtersForMessage,
  messageSupportsFilteringAttributes,
  toStepDraft,
} from "../../model/stepForm";
import { catalogFixture } from "../catalogFixture";
import type { StepOptionsDto } from "../../model/contracts";

const options: StepOptionsDto = {
  messages: [{ id: "msg-update", name: "Update" }],
  filters: [
    {
      id: "filter-account",
      messageId: "msg-update",
      primaryEntity: "account",
      secondaryEntity: "none",
      availability: 0,
    },
  ],
  users: [{ id: "user-1", fullName: "Ada Lovelace" }],
};

describe("stepForm", () => {
  it("omits empty filter and impersonation on create drafts", () => {
    const form = createStepForm(undefined, "type-1");
    form.name = "New step";
    form.pluginTypeId = "type-1";
    form.messageId = "msg-update";
    expect(toStepDraft(form)).toMatchObject({
      filterId: null,
      impersonatingUserId: null,
      filteringAttributes: [],
      secureConfigurationAction: "keep",
      secureConfiguration: null,
    });
  });

  it("keeps an unavailable current filter", () => {
    const step = catalogFixture.steps[0]!;
    const filters = filtersForMessage(options, step.messageId, {
      id: step.filterId!,
      primaryEntity: step.primaryEntity,
      secondaryEntity: step.secondaryEntity,
    });
    expect(filters[0]?.id).toBe(step.filterId);
    expect(filters[0] && "unavailable" in filters[0] && filters[0].unavailable).toBe(true);
    expect(filterLabel({ primaryEntity: "account", secondaryEntity: "contact" })).toBe(
      "account (contact)",
    );
    expect(filterLabel({ primaryEntity: "account", secondaryEntity: "none" })).toBe("account");
  });

  it("supports filtering attributes only for selected messages", () => {
    expect(messageSupportsFilteringAttributes("Update")).toBe(true);
    expect(messageSupportsFilteringAttributes("Delete")).toBe(false);
  });
});
