import { describe, expect, it } from "vitest";

import {
  buildDetailSections,
  optionsView,
  relatedTables,
  sourceLabel,
  yesNo,
} from "../../model/details";
import { toAttributeExplorerError } from "../../model/apiError";
import { accountAttributes, attribute } from "../fixtures";

const byLogical = (name: string) => accountAttributes.find((a) => a.logicalName === name)!;
const rowsOf = (sections: ReturnType<typeof buildDetailSections>, id: string) =>
  sections.find((section) => section.id === id)?.rows ?? [];

describe("field details", () => {
  it("builds general rows and hides empty ones", () => {
    const general = rowsOf(buildDetailSections(byLogical("name")), "general");
    const labels = general.map((row) => row.label);

    expect(labels).toEqual([
      "Type",
      "Required",
      "Description",
      "Origin",
      "Managed state",
      "Primary name",
      "Introduced version",
      "Metadata id",
    ]);
    expect(general[0]).toEqual({ label: "Type", value: "Single line of text", muted: "StringType" });
    expect(general.find((row) => row.label === "Origin")?.value).toBe("System");
    expect(general.find((row) => row.label === "Managed state")?.value).toBe("Unmanaged");
  });

  it("shows custom and managed state", () => {
    const rows = rowsOf(
      buildDetailSections(attribute({ logicalName: "x", isCustom: true, isManaged: true, isPrimaryId: true })),
      "general",
    );
    expect(rows.find((row) => row.label === "Origin")?.value).toBe("Custom");
    expect(rows.find((row) => row.label === "Managed state")?.value).toBe("Managed");
    expect(rows.find((row) => row.label === "Primary id")?.value).toBe("Yes");
  });

  it("omits the type details section when nothing applies", () => {
    const sections = buildDetailSections(attribute({ logicalName: "x" }));
    expect(sections.map((section) => section.id)).toEqual(["general", "behavior"]);
  });

  it("builds type details for numbers", () => {
    const rows = rowsOf(buildDetailSections(byLogical("revenue")), "typeDetails");
    expect(rows).toEqual([
      { label: "Min / Max", value: "0 to 100000000000000" },
      { label: "Precision", value: "2" },
    ]);
  });

  it("builds type details for text and choices", () => {
    expect(rowsOf(buildDetailSections(byLogical("name")), "typeDetails")).toEqual([
      { label: "Max length", value: "160" },
      { label: "Format", value: "Text" },
    ]);
    expect(rowsOf(buildDetailSections(byLogical("industrycode")), "typeDetails")).toEqual([
      { label: "Default value", value: "Accounting (1)" },
    ]);
  });

  it("handles a one-sided range", () => {
    const rows = rowsOf(
      buildDetailSections(attribute({ logicalName: "x", minValue: "5" })),
      "typeDetails",
    );
    expect(rows).toEqual([{ label: "Min / Max", value: "Min 5" }]);
  });

  it("shows behavior flags as Yes, No, or a dash", () => {
    const rows = rowsOf(buildDetailSections(byLogical("name")), "behavior");
    const value = (label: string) => rows.find((row) => row.label === label)?.value;
    expect(value("Valid for create")).toBe("Yes");
    expect(value("Auditing enabled")).toBe("Yes");
    expect(value("Retrievable")).toBe("—");
    expect(yesNo(false)).toBe("No");
  });

  it("maps source types", () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel(0)).toBe("Simple");
    expect(sourceLabel(1)).toBe("Calculated");
    expect(sourceLabel(2)).toBe("Rollup");
    expect(sourceLabel(3)).toBe("Formula");
    expect(sourceLabel(9)).toBe("9");
  });

  it("pairs lookup targets with their relationships", () => {
    expect(relatedTables(byLogical("customerid"))).toEqual([
      { logicalName: "account", relationship: "account_customer_account" },
      { logicalName: "contact", relationship: "account_customer_contact" },
    ]);
    expect(relatedTables(attribute({ logicalName: "x", targets: ["a"] }))).toEqual([
      { logicalName: "a", relationship: null },
    ]);
    expect(relatedTables(byLogical("name"))).toEqual([]);
  });

  it("builds option lists for choices and yes/no", () => {
    expect(optionsView(byLogical("industrycode"))).toEqual({
      name: "account_industrycode",
      scope: "Local",
      options: [
        { value: 1, label: "Accounting" },
        { value: 2, label: "Agriculture" },
      ],
    });
    expect(optionsView(byLogical("donotemail"))).toEqual({
      name: null,
      scope: null,
      options: [
        { value: 1, label: "Do Not Allow" },
        { value: 0, label: "Allow" },
      ],
    });
    expect(optionsView(byLogical("name"))).toBeNull();
  });

  it("labels global option sets", () => {
    const view = optionsView(
      attribute({ logicalName: "x", optionSet: { name: "shared", isGlobal: true, options: [] } }),
    );
    expect(view?.scope).toBe("Global");
  });
});

describe("api error", () => {
  it("prefers the problem message", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: { data: { code: "table_not_found", message: "This table no longer exists." } },
    });
    expect(toAttributeExplorerError(error)).toBe("This table no longer exists.");
    expect(toAttributeExplorerError(new Error("boom"))).toBe("boom");
    expect(toAttributeExplorerError(null)).toBe("The attribute explorer request failed.");
  });
});
