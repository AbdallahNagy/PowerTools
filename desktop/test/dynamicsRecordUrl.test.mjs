import { expect, test } from "vitest";

import { buildDynamicsRecordUrl } from "../src/ui/components/tools/MetadataExplorer/model/dynamicsRecordUrl.ts";

test("buildDynamicsRecordUrl creates a Dynamics entity record URL", () => {
  expect(buildDynamicsRecordUrl({
      envUrl: "https://contoso.crm.dynamics.com/",
      entityLogicalName: "account",
      recordId: "{00000000-0000-0000-0000-000000000001}",
    })).toBe("https://contoso.crm.dynamics.com/main.aspx?etn=account&pagetype=entityrecord&id=00000000-0000-0000-0000-000000000001");
});

test("buildDynamicsRecordUrl encodes URL parameters", () => {
  expect(buildDynamicsRecordUrl({
      envUrl: "https://crm.example.test/org",
      entityLogicalName: "new custom",
      recordId: "id with spaces",
    })).toBe("https://crm.example.test/org/main.aspx?etn=new+custom&pagetype=entityrecord&id=id+with+spaces");
});
