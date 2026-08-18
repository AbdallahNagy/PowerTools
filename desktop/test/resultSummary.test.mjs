import { expect, test } from "vitest";
import { formatFetchResultSummary } from "../src/ui/components/tools/MetadataExplorer/model/resultSummary.ts";

test("shows fetched and total matching record counts when Dataverse returns a total", () => {
  expect(formatFetchResultSummary({
      fetchedCount: 50,
      totalEstimate: 1284,
      moreRecords: true,
    })).toBe("50 records fetched - 1,284 total matching records");
});

test("falls back to fetched record count when no total is returned", () => {
  expect(formatFetchResultSummary({
      fetchedCount: 12,
      totalEstimate: null,
      moreRecords: false,
    })).toBe("12 records fetched");
});
