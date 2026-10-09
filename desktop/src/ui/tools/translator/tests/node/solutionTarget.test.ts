import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { toTranslatorError } from "../../model/apiError";
import {
  EMPTY_SOLUTION_TARGET,
  solutionNeedsAttention,
  solutionTargetErrors,
  targetSolutions,
  toApplySolution,
  uniqueNameFrom,
} from "../../model/solutionTarget";
import { solutionsFixture } from "../fixtures";

const newTarget = {
  ...EMPTY_SOLUTION_TARGET,
  enabled: true,
  mode: "new" as const,
  friendlyName: "Labels FR",
  uniqueName: "LabelsFR",
  publisherId: "pub-1",
};

describe("solution target", () => {
  it("offers only unmanaged solutions other than Default and Active", () => {
    const solutions = [
      ...solutionsFixture,
      { ...solutionsFixture[0]!, solutionId: "x", uniqueName: "Active", friendlyName: "Active" },
    ];
    expect(targetSolutions(solutions).map((solution) => solution.uniqueName)).toEqual(["ContosoCore"]);
  });

  it("derives a unique name from the display name", () => {
    expect(uniqueNameFrom("Labels FR (2026)")).toBe("LabelsFR2026");
    expect(uniqueNameFrom("2026 labels")).toBe("_2026labels");
    expect(uniqueNameFrom("—")).toBe("");
  });

  it("has no errors when the option is off and requires a solution when on", () => {
    expect(solutionTargetErrors(EMPTY_SOLUTION_TARGET)).toEqual({});
    expect(solutionTargetErrors({ ...EMPTY_SOLUTION_TARGET, enabled: true })).toEqual({ existing: "Choose a solution." });
    expect(toApplySolution(EMPTY_SOLUTION_TARGET)).toBeUndefined();
    expect(toApplySolution({ ...EMPTY_SOLUTION_TARGET, enabled: true, existing: "ContosoCore" })).toEqual({
      uniqueName: "ContosoCore",
    });
  });

  it("checks the fields of a new solution", () => {
    expect(solutionTargetErrors(newTarget)).toEqual({});
    expect(solutionTargetErrors({ ...newTarget, uniqueName: "9bad" }).uniqueName).toMatch(/letters, numbers/);
    expect(solutionTargetErrors({ ...newTarget, uniqueName: "default" }).uniqueName).toBe("This name is reserved.");
    expect(solutionTargetErrors({ ...newTarget, version: "1" }).version).toBeDefined();
    expect(solutionTargetErrors({ ...newTarget, publisherId: "", friendlyName: " " })).toEqual({
      friendlyName: "Enter a display name.",
      publisherId: "Choose a publisher.",
    });
    expect(toApplySolution({ ...newTarget, friendlyName: " Labels FR " })).toEqual({
      new: { friendlyName: "Labels FR", uniqueName: "LabelsFR", publisherId: "pub-1", version: "1.0.0.0" },
    });
  });

  it("flags failed and partial solution results", () => {
    expect(solutionNeedsAttention(undefined)).toBe(false);
    for (const [status, expected] of [
      ["succeeded", false],
      ["notNeeded", false],
      ["partial", true],
      ["failed", true],
    ] as const) {
      expect(
        solutionNeedsAttention({
          status,
          uniqueName: "x",
          friendlyName: "x",
          created: false,
          added: 0,
          failed: 0,
          message: null,
          failures: [],
        }),
      ).toBe(expected);
    }
  });
});

describe("translator errors", () => {
  it("turns a client timeout into a message with Retry advice", () => {
    const error = new AxiosError("timeout of 120000ms exceeded", "ECONNABORTED", {
      timeout: 120_000,
      headers: new AxiosHeaders(),
    });
    expect(toTranslatorError(error)).toBe(
      "The environment did not answer within 120 seconds. Retry, or check the connection.",
    );
  });
});
