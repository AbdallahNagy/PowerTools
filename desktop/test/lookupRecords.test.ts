import test from "node:test";
import assert from "node:assert/strict";
import { buildLookupFetchXml } from "../src/ui/components/tools/MetadataExplorer/model/lookupFetchXml.ts";
import type { EntityInfo } from "../src/ui/components/tools/MetadataExplorer/model/types.ts";

const account: EntityInfo = {
  logicalName: "account",
  displayName: "Account",
  primaryIdAttribute: "accountid",
  primaryNameAttribute: "name",
  isCustom: false,
};

test("lookup record fetch xml retrieves created on and orders by latest records", () => {
  assert.equal(
    buildLookupFetchXml(account, ""),
    '<fetch><entity name="account"><attribute name="accountid" /><attribute name="name" /><attribute name="createdon" /><order attribute="createdon" descending="true" /></entity></fetch>',
  );
});
