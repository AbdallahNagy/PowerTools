import { expect, test } from "vitest";
import { buildLookupFetchXml } from "../../model/lookupFetchXml.ts";
import type { EntityInfo } from "../../../../shared/contracts/dataverse.ts";

const account: EntityInfo = {
  logicalName: "account",
  displayName: "Account",
  primaryIdAttribute: "accountid",
  primaryNameAttribute: "name",
  isCustom: false,
};

test("lookup record fetch xml retrieves created on and orders by latest records", () => {
  expect(buildLookupFetchXml(account, "")).toBe('<fetch><entity name="account"><attribute name="accountid" /><attribute name="name" /><attribute name="createdon" /><order attribute="createdon" descending="true" /></entity></fetch>');
});

test("lookup record fetch xml matches a GUID against the primary ID", () => {
  expect(buildLookupFetchXml(account, "052eaa22-e287-4a3f-9af8-021c12944db9")).toBe(
    '<fetch><entity name="account"><attribute name="accountid" /><attribute name="name" /><attribute name="createdon" /><order attribute="createdon" descending="true" /><filter><condition attribute="accountid" operator="eq" value="052eaa22-e287-4a3f-9af8-021c12944db9" /></filter></entity></fetch>',
  );
});

test("lookup record fetch xml removes braces before matching a GUID", () => {
  expect(buildLookupFetchXml(account, " {052eaa22-e287-4a3f-9af8-021c12944db9} ")).toBe(
    '<fetch><entity name="account"><attribute name="accountid" /><attribute name="name" /><attribute name="createdon" /><order attribute="createdon" descending="true" /><filter><condition attribute="accountid" operator="eq" value="052eaa22-e287-4a3f-9af8-021c12944db9" /></filter></entity></fetch>',
  );
});

test("lookup record fetch xml keeps non-GUID searches on the primary name", () => {
  expect(buildLookupFetchXml(account, " Contoso ")).toBe(
    '<fetch><entity name="account"><attribute name="accountid" /><attribute name="name" /><attribute name="createdon" /><order attribute="createdon" descending="true" /><filter><condition attribute="name" operator="like" value="%Contoso%" /></filter></entity></fetch>',
  );
});
