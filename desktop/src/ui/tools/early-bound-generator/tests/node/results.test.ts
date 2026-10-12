import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_SORT,
  filterFiles,
  formatDuration,
  matchedNothing,
  nextFileSort,
  sortFiles,
} from "../../model/results";
import { describeFailure } from "../../model/apiError";
import { generatedFiles } from "../fixtures";

describe("file results", () => {
  it("sorts by file ascending by default and toggles direction on the same header", () => {
    expect(sortFiles(generatedFiles, DEFAULT_FILE_SORT).map((file) => file.path)).toEqual([
      "builderSettings.json",
      "DataverseContext.cs",
      "Entities/account.cs",
      "Entities/contact.cs",
      "OptionSets/account_industrycode.cs",
    ]);
    const byKind = nextFileSort(DEFAULT_FILE_SORT, "kind");
    expect(byKind).toEqual({ key: "kind", direction: "asc" });
    expect(nextFileSort(byKind, "kind")).toEqual({ key: "kind", direction: "desc" });
    expect(sortFiles(generatedFiles, { key: "kind", direction: "desc" }).map((file) => file.kind)).toEqual([
      "Table",
      "Table",
      "Settings",
      "Service context",
      "Choice",
    ]);
  });

  it("filters by file and name", () => {
    expect(filterFiles(generatedFiles, "INDUSTRY").map((file) => file.name)).toEqual(["account_industrycode"]);
    expect(filterFiles(generatedFiles, "entities/").length).toBe(2);
    expect(filterFiles(generatedFiles, "  ").length).toBe(generatedFiles.length);
  });

  it("detects a run that wrote no table, choice, or message", () => {
    expect(matchedNothing(generatedFiles)).toBe(false);
    expect(matchedNothing(generatedFiles.filter((file) => file.kind === "Settings" || file.kind === "Service context"))).toBe(true);
  });

  it("formats durations", () => {
    expect(formatDuration(200)).toBe("1 s");
    expect(formatDuration(8_400)).toBe("8 s");
    expect(formatDuration(72_000)).toBe("1 min 12 s");
    expect(formatDuration(180_000)).toBe("3 min");
  });

  it("words folder and connection failures plainly", () => {
    expect(describeFailure("folderAccess", "Access to the path is denied.", "Dev")).toBe(
      "You do not have permission to write to this folder.",
    );
    expect(describeFailure("connection", "socket closed", "Dev")).toBe(
      "The connection to Dev was lost. Reconnect and select Generate again.",
    );
    expect(describeFailure("privilege", "Missing prvReadSdkMessage.", "Dev")).toBe("Missing prvReadSdkMessage.");
  });
});
