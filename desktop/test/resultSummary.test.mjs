import test from "node:test";
import assert from "node:assert/strict";
import { formatFetchResultSummary } from "../src/ui/components/tools/MetadataExplorer/model/resultSummary.ts";

test("shows fetched and total matching record counts when Dataverse returns a total", () => {
  assert.equal(
    formatFetchResultSummary({
      fetchedCount: 50,
      totalEstimate: 1284,
      moreRecords: true,
    }),
    "50 records fetched - 1,284 total matching records",
  );
});

test("falls back to fetched record count when no total is returned", () => {
  assert.equal(
    formatFetchResultSummary({
      fetchedCount: 12,
      totalEstimate: null,
      moreRecords: false,
    }),
    "12 records fetched",
  );
});
