import { describe, expect, it } from "vitest";
import {
  applyDefaultMessage,
  createStepForm,
  deploymentFlags,
  deploymentFromFlags,
  filterLabel,
  filteringAttributesEnabled,
  filteringAttributesSummary,
  filtersForMessage,
  isNoneEntity,
  messageSupportsFilteringAttributes,
  primaryEntitiesForMessage,
  resolveFilterId,
  secondaryEntitiesForPrimary,
  selectMessage,
  selectMode,
  selectPrimaryEntity,
  selectStage,
  toStepDraft,
  toggleDeployment,
} from "../../model/stepForm";
import { catalogFixture } from "../catalogFixture";
import type { StepOptionsDto } from "../../model/contracts";

const options: StepOptionsDto = {
  messages: [
    { id: "msg-update", name: "Update" },
    { id: "msg-associate", name: "Associate" },
  ],
  filters: [
    {
      id: "filter-none",
      messageId: "msg-update",
      primaryEntity: "none",
      secondaryEntity: "none",
      availability: 2,
    },
    {
      id: "filter-account",
      messageId: "msg-update",
      primaryEntity: "account",
      secondaryEntity: "none",
      availability: 0,
    },
    {
      id: "filter-contact",
      messageId: "msg-update",
      primaryEntity: "contact",
      secondaryEntity: "none",
      availability: 0,
    },
    {
      id: "filter-associate-none",
      messageId: "msg-associate",
      primaryEntity: "account",
      secondaryEntity: "none",
      availability: 0,
    },
    {
      id: "filter-associate-contact",
      messageId: "msg-associate",
      primaryEntity: "account",
      secondaryEntity: "contact",
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
    expect(filteringAttributesEnabled("Update", "account")).toBe(true);
    expect(filteringAttributesEnabled("Update", "")).toBe(false);
    expect(filteringAttributesEnabled("Delete", "account")).toBe(false);
  });

  it("excludes none from primary entity options", () => {
    expect(isNoneEntity("none")).toBe(true);
    expect(isNoneEntity("NONE")).toBe(true);
    expect(primaryEntitiesForMessage(options, "msg-update")).toEqual(["account", "contact"]);
    expect(primaryEntitiesForMessage(options, "msg-update")).not.toContain("none");
  });

  it("resolves filter ids from primary and secondary entities", () => {
    expect(resolveFilterId(options, "msg-update", "account", "")).toBe("filter-account");
    expect(resolveFilterId(options, "msg-update", "", "")).toBe("filter-none");
    expect(resolveFilterId(options, "msg-associate", "account", "contact")).toBe(
      "filter-associate-contact",
    );
    expect(resolveFilterId(options, "msg-associate", "account", "")).toBe(
      "filter-associate-none",
    );
    expect(secondaryEntitiesForPrimary(options, "msg-associate", "account")).toEqual([
      "contact",
    ]);
    expect(secondaryEntitiesForPrimary(options, "msg-update", "account")).toEqual([]);
  });

  it("clears entity selections when the message changes", () => {
    const form = selectPrimaryEntity(
      applyDefaultMessage(createStepForm(undefined, "type-1"), options),
      "account",
      options,
    );
    expect(form.filterId).toBe("filter-account");
    const next = selectMessage(form, "msg-associate", options);
    expect(next.primaryEntity).toBe("");
    expect(next.secondaryEntity).toBe("");
    expect(next.filteringAttributes).toEqual([]);
  });

  it("encodes deployment checkboxes and rejects neither", () => {
    expect(deploymentFlags(0)).toEqual({ server: true, offline: false });
    expect(deploymentFlags(1)).toEqual({ server: false, offline: true });
    expect(deploymentFlags(2)).toEqual({ server: true, offline: true });
    expect(deploymentFromFlags(true, true)).toBe(2);
    expect(toggleDeployment(0, "offline", true)).toBe(2);
    expect(toggleDeployment(0, "server", false)).toBe(0);
    expect(toggleDeployment(1, "offline", false)).toBe(1);
    expect(filteringAttributesSummary(0)).toBe("None selected");
    expect(filteringAttributesSummary(3)).toBe("3 selected");
  });

  it("locks async mode to post-operation and clears auto-delete on sync", () => {
    const asyncForm = selectMode(
      { ...createStepForm(undefined, "type-1"), stage: 10, asyncAutoDelete: true },
      1,
    );
    expect(asyncForm.mode).toBe(1);
    expect(asyncForm.stage).toBe(40);
    expect(selectStage(asyncForm, 10).stage).toBe(40);
    expect(selectMode(asyncForm, 0)).toMatchObject({ mode: 0, asyncAutoDelete: false });
  });
});
