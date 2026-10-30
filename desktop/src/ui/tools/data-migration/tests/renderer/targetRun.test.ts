import { describe, expect, it } from "vitest";
import type { MigrationJobStatus } from "../../api/useMigrationJob";
import { nextTarget, settingsKey, targetState } from "../../model/targetRun";

const done = (failed = 0, status: MigrationJobStatus["status"] = "completed"): MigrationJobStatus => ({
  status,
  processed: 2,
  total: 2,
  succeeded: 2 - failed,
  created: 2 - failed,
  updated: 0,
  skipped: 0,
  deleted: 0,
  failed,
  errors: [],
});

describe("target runs", () => {
  it("picks the first target not migrated yet, skipping the one running", () => {
    expect(nextTarget(["qc", "uat", "prod"], {}, null)).toBe("qc");
    expect(nextTarget(["qc", "uat", "prod"], { qc: done() }, null)).toBe("uat");
    expect(nextTarget(["qc", "uat", "prod"], { qc: done() }, "uat")).toBe("prod");
    expect(nextTarget(["qc", "uat"], { qc: done(), uat: done(1) }, null)).toBeNull();
  });

  it("names each target state", () => {
    expect(targetState(undefined, false)).toBe("pending");
    expect(targetState(done(), true)).toBe("running");
    expect(targetState(done(), false)).toBe("succeeded");
    expect(targetState(done(1), false)).toBe("partial");
    expect(targetState(done(0, "failed"), false)).toBe("failed");
  });

  it("treats any change to source, entity, fields, filter, or options as new settings", () => {
    const base = {
      sourceConnectionId: "dev",
      entityLogicalName: "account",
      attributes: ["name"],
      create: true,
      update: true,
      delete: false,
    };
    expect(settingsKey(base)).toBe(settingsKey({ ...base, fetchXmlFilter: "" }));
    expect(settingsKey(base)).not.toBe(settingsKey({ ...base, attributes: ["name", "phone"] }));
    expect(settingsKey(base)).not.toBe(settingsKey({ ...base, fetchXmlFilter: "<filter/>" }));
    expect(settingsKey(base)).not.toBe(settingsKey({ ...base, update: false }));
    expect(settingsKey(base)).not.toBe(settingsKey({ ...base, delete: true }));
  });
});
