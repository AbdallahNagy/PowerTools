import test from "node:test";
import assert from "node:assert/strict";
import { formatFetchXml } from "../src/ui/components/tools/MetadataExplorer/model/fetchxmlFormat.ts";

test("formats sibling value tags at the same indentation level", () => {
  const xml =
    '<fetch><entity name="mohesr_file"><filter type="and"><condition attribute="mohesr_regardingid" operator="in"><value>052eaa22-e287-4a3f-9af8-021c12944db9</value><value>1785bdf6-1e64-487f-9198-004c23bb5b80</value><value>f51dfcb4-3cf8-48d5-8565-003e2a3e3b87</value></condition></filter></entity></fetch>';

  assert.equal(
    formatFetchXml(xml),
    [
      '<fetch>',
      '  <entity name="mohesr_file">',
      '    <filter type="and">',
      '      <condition attribute="mohesr_regardingid" operator="in">',
      '        <value>052eaa22-e287-4a3f-9af8-021c12944db9</value>',
      '        <value>1785bdf6-1e64-487f-9198-004c23bb5b80</value>',
      '        <value>f51dfcb4-3cf8-48d5-8565-003e2a3e3b87</value>',
      '      </condition>',
      '    </filter>',
      '  </entity>',
      '</fetch>',
    ].join("\n"),
  );
});
