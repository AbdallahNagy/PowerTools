import { describe, expect, it } from "vitest";
import { dayEndUtc, dayStartUtc, defaultRange, isRangeValid } from "../../model/dates";
import { restoreDetail } from "../../model/faults";
import { fieldRows, filterFields } from "../../model/fields";
import {
  chunk,
  latestDeletions,
  leftTheBin,
  orderForRestore,
  repeatedRecordCount,
  RESTORE_CHUNK_SIZE,
  toRestoreItem,
} from "../../model/restoreBatches";
import { availableSources, sourceFor, sourceLine } from "../../model/sourceChoice";
import type { RestoreResult } from "../../model/types";
import { nextSort, sortRecords, summaryText } from "../../model/view";
import {
  alphaValues,
  projectAlpha,
  projectAlphaEarlier,
  projectAttributes,
  projectBeta,
  projectNoValues,
  statusFixture,
  tablesFixture,
} from "../fixtures";

const [account, project] = tablesFixture.tables as [
  (typeof tablesFixture.tables)[number],
  (typeof tablesFixture.tables)[number],
];

function result(partial: Partial<RestoreResult>): RestoreResult {
  return {
    table: "account",
    recordId: "x",
    auditId: null,
    status: "failed",
    code: null,
    message: null,
    warning: null,
    ...partial,
  };
}

describe("source choice", () => {
  it("prefers the recycle bin and falls back to the audit log", () => {
    expect(sourceFor(account)).toBe("bin");
    expect(sourceFor(project)).toBe("audit");
    expect(sourceFor({ ...project, auditEnabled: false })).toBeNull();
    expect(sourceFor(null)).toBeNull();
  });

  it("lets a table in the recycle bin that is also audited switch to the audit log", () => {
    expect(availableSources(account)).toEqual(["bin", "audit"]);
    expect(availableSources(project)).toEqual(["audit"]);
    expect(sourceFor(account, "audit")).toBe("audit");
    expect(sourceFor({ ...account, auditEnabled: false }, "audit")).toBe("bin");
    expect(sourceFor(project, "bin")).toBe("audit");
    expect(sourceLine("audit", account, statusFixture).notes).toContain(
      "Records that are still in the recycle bin are skipped when restoring.",
    );
  });

  it("describes each source on one line", () => {
    expect(sourceLine("bin", account, statusFixture).label).toBe("Recycle bin, keeps records 30 days");
    const audit = sourceLine("audit", project, statusFixture);
    expect(audit.label).toBe("Audit log, keeps entries 90 days");
    expect(audit.notes).toContain("Only audited fields that had a value can be recovered.");
    expect(audit.notes).toContain("This table is not in the recycle bin.");

    const onPremises = sourceLine("audit", project, {
      ...statusFixture,
      bin: { state: "unavailable", reason: "The recycle bin is available only in Dataverse online.", retentionDays: null },
    });
    expect(onPremises.notes).toContain("Recycle bin: The recycle bin is available only in Dataverse online.");
  });
});

describe("restore batches", () => {
  it("restores the most recent deletion of a record deleted twice", () => {
    const rows = [projectAlphaEarlier, projectAlpha, projectBeta];
    expect(repeatedRecordCount(rows)).toBe(1);
    const latest = latestDeletions(rows);
    expect(latest.rows).toEqual([projectAlpha, projectBeta]);
    expect(latest.dropped).toBe(1);
  });

  it("orders audit restores oldest deletion first and keeps the user's order for the bin", () => {
    const rows = [projectBeta, projectAlpha, projectNoValues];
    expect(orderForRestore("audit", rows).map((row) => row.name)).toEqual([null, "Alpha", "Beta"]);
    expect(orderForRestore("bin", rows)).toEqual(rows);
  });

  it("finds waiting records that are no longer in the bin, ignoring case", () => {
    const waiting = [projectAlpha, projectBeta];
    expect(leftTheBin(waiting, [projectBeta.recordId.toUpperCase()])).toEqual([projectAlpha]);
    expect(leftTheBin(waiting, [projectAlpha.recordId, projectBeta.recordId])).toEqual([]);
  });

  it("marks records an earlier run tried as retries", () => {
    expect(toRestoreItem(projectAlpha)).not.toHaveProperty("retry");
    expect(toRestoreItem(projectAlpha, true)).toMatchObject({ recordId: projectAlpha.recordId, retry: true });
  });

  it("splits selections into chunks the sidecar accepts", () => {
    const items = Array.from({ length: 60 }, (_, index) => index);
    const chunks = chunk(items);
    expect(RESTORE_CHUNK_SIZE).toBeLessThanOrEqual(100);
    expect(chunks.map((part) => part.length)).toEqual([25, 25, 10]);
    expect(chunks.flat()).toEqual(items);
  });
});

describe("restore messages", () => {
  it("maps fault codes to plain words", () => {
    expect(restoreDetail(result({ code: "DuplicateRecord" }))).toBe("A record with this ID already exists.");
    expect(restoreDetail(result({ code: "RelatedRecordMissing" }))).toBe(
      "A related record this one points to no longer exists. Restore that record first.",
    );
    expect(restoreDetail(result({ code: "ChoiceValueRemoved" }))).toContain("Add the option back");
    expect(restoreDetail(result({ code: "PluginError", message: "Blocked by policy" }))).toBe(
      "A plug-in stopped the restore: Blocked by policy",
    );
    expect(restoreDetail(result({ code: "DataverseFault", message: "Something else" }))).toBe("Something else");
    expect(restoreDetail(result({ status: "restored", warning: "Restored as active." }))).toBe("Restored as active.");
    expect(restoreDetail(result({ status: "restored" }))).toBe("");
    expect(restoreDetail(result({ status: "alreadyRestored" }))).toBe(
      "This record already exists. An earlier attempt restored it.",
    );
    expect(summaryText({ restored: 3, failed: 1, skipped: 0, alreadyRestored: 0 })).toBe("3 restored, 1 failed");
    expect(summaryText({ restored: 3, failed: 0, skipped: 1, alreadyRestored: 2 })).toBe(
      "3 restored, 0 failed, 2 already restored, 1 skipped",
    );
  });
});

describe("dates", () => {
  it("defaults to the last 30 days", () => {
    expect(defaultRange(new Date(2026, 9, 11, 15, 0))).toEqual({ from: "2026-09-11", to: "2026-10-11" });
  });

  it("turns local calendar days into UTC bounds that include the whole To day", () => {
    expect(dayStartUtc("2026-10-01")).toBe(new Date(2026, 9, 1).toISOString());
    expect(dayEndUtc("2026-10-11")).toBe(new Date(2026, 9, 12).toISOString());
    expect(dayStartUtc("not a day")).toBeNull();
  });

  it("requires From on or before To", () => {
    expect(isRangeValid("2026-10-01", "2026-10-01")).toBe(true);
    expect(isRangeValid("2026-10-02", "2026-10-01")).toBe(false);
    expect(isRangeValid("", "2026-10-01")).toBe(false);
  });
});

describe("field values", () => {
  it("shows labels, names and Yes or No, and filters on any column", () => {
    const rows = fieldRows(alphaValues.fields, projectAttributes);
    const byName = Object.fromEntries(rows.map((row) => [row.logicalName, row]));
    expect(byName.new_phase).toMatchObject({ displayName: "Phase", value: "Build", raw: "2" });
    expect(byName.new_isbillable!.value).toBe("Yes");
    expect(byName.new_accountid).toMatchObject({ value: "Contoso", raw: "account:22222222-0000-0000-0000-000000000001" });
    expect(filterFields(rows, "build").map((row) => row.logicalName)).toEqual(["new_phase"]);
    expect(filterFields(rows, "new_name").map((row) => row.logicalName)).toEqual(["new_name"]);
  });

  it("falls back to the logical name without metadata", () => {
    expect(fieldRows(alphaValues.fields, undefined)[1]).toMatchObject({ displayName: "new_phase", value: "2" });
  });
});

describe("sorting", () => {
  it("sorts by header, ascending first then descending", () => {
    const sort = nextSort({ key: "deletedOn" as const, direction: "desc" as const }, "name");
    expect(sort).toEqual({ key: "name", direction: "asc" });
    expect(nextSort(sort, "name")).toEqual({ key: "name", direction: "desc" });
    expect(sortRecords([projectBeta, projectAlpha], sort).map((row) => row.name)).toEqual(["Alpha", "Beta"]);
    expect(
      sortRecords([projectAlpha, projectBeta], { key: "deletedOn", direction: "desc" }).map((row) => row.name),
    ).toEqual(["Beta", "Alpha"]);
  });
});
