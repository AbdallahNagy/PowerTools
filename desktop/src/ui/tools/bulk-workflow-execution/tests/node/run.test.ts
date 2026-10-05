import { describe, expect, it } from "vitest";

import {
  canStart,
  clampBatchSize,
  clampDelay,
  defaultBatchSize,
  endSummary,
  formatRemaining,
  isActiveStatus,
  isEndStatus,
  runStatusText,
} from "../../model/run";
import { runFixture } from "../fixtures";

describe("bulk workflow run helpers", () => {
  it("formats the remaining time", () => {
    expect(formatRemaining(null)).toBe("Estimating…");
    expect(formatRemaining(0)).toBe("under 1 min");
    expect(formatRemaining(59)).toBe("under 1 min");
    expect(formatRemaining(180)).toBe("3 min");
    expect(formatRemaining(3840)).toBe("1 h 4 min");
    expect(formatRemaining(7200)).toBe("2 h");
  });

  it("clamps batch size and delay", () => {
    expect(clampBatchSize("0", 100)).toBe(1);
    expect(clampBatchSize("5000", 100)).toBe(1000);
    expect(clampBatchSize("abc", 100)).toBe(100);
    expect(clampBatchSize("250", 100)).toBe(250);
    expect(clampDelay("-3")).toBe(0);
    expect(clampDelay("900")).toBe(300);
    expect(clampDelay("")).toBe(0);
  });

  it("starts real-time workflows with smaller batches", () => {
    expect(defaultBatchSize("background")).toBe(100);
    expect(defaultBatchSize("realtime")).toBe(25);
    expect(defaultBatchSize(null)).toBe(100);
  });

  it("only allows Start for a finished count of the current workflow and text", () => {
    const count = { workflowId: "a", fetchXml: "<fetch/>", count: 3 };
    expect(canStart(count, "a", "<fetch/>")).toBe(true);
    expect(canStart(count, "b", "<fetch/>")).toBe(false);
    expect(canStart(count, "a", "<fetch />")).toBe(false);
    expect(canStart({ ...count, count: 0 }, "a", "<fetch/>")).toBe(false);
    expect(canStart(null, "a", "<fetch/>")).toBe(false);
  });

  it("describes end states and status-bar text", () => {
    expect(endSummary(runFixture({ status: "completed", succeeded: 1283, failed: 1, processed: 1284 }))).toBe(
      "Finished. 1,283 started, 1 errors.",
    );
    expect(endSummary(runFixture({ status: "cancelled" }))).toBe("Stopped. 199 started, 1 errors, 1,084 not run.");
    expect(endSummary(runFixture({ status: "failed", message: "Boom." }))).toBe("The run failed: Boom.");

    expect(runStatusText(undefined)).toBe("Collecting record IDs…");
    expect(runStatusText(runFixture())).toBe("Running 200/1,284");
    expect(runStatusText(runFixture({ status: "completed" }))).toBe("Finished: 199 started, 1 errors");
    expect(runStatusText(runFixture({ status: "cancelled" }))).toBe("Stopped: 199 started, 1 errors");
    expect(runStatusText(runFixture({ status: "failed" }))).toBe("Run failed");
  });

  it("knows which statuses end a run", () => {
    expect(isEndStatus("completed")).toBe(true);
    expect(isEndStatus("cancelled")).toBe(true);
    expect(isEndStatus("failed")).toBe(true);
    expect(isEndStatus("cancelling")).toBe(false);
    expect(isActiveStatus("collecting")).toBe(true);
    expect(isActiveStatus(undefined)).toBe(false);
  });
});
