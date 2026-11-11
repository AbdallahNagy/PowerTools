import { describe, expect, it } from "vitest";
import { buildFetchXml } from "../src/fetchXmlQuery";

describe("buildFetchXml", () => {
  it("builds a select with top", () => {
    expect(buildFetchXml("account", { select: ["name"], top: 5 })).toBe(
      '<fetch top="5"><entity name="account"><attribute name="name" /></entity></fetch>',
    );
  });

  it("escapes filter values", () => {
    const xml = buildFetchXml("account", { filter: [{ column: "name", operator: "eq", value: 'a"<b' }] });
    expect(xml).toBe(
      '<fetch><entity name="account"><filter type="and"><condition attribute="name" operator="eq" value="a&quot;&lt;b" /></filter></entity></fetch>',
    );
  });

  it("escapes table and column names", () => {
    const xml = buildFetchXml('a"b', { select: ["x<y"] });
    expect(xml).toBe('<fetch><entity name="a&quot;b"><attribute name="x&lt;y" /></entity></fetch>');
  });

  it("produces one value element per item for in", () => {
    const xml = buildFetchXml("account", { filter: [{ column: "statecode", operator: "in", value: [1, 2] }] });
    expect(xml).toBe(
      '<fetch><entity name="account"><filter type="and"><condition attribute="statecode" operator="in"><value>1</value><value>2</value></condition></filter></entity></fetch>',
    );
  });

  it("writes null and not-null without a value", () => {
    const xml = buildFetchXml("account", {
      filter: [
        { column: "a", operator: "null" },
        { column: "b", operator: "not-null" },
      ],
    });
    expect(xml).toContain('<condition attribute="a" operator="null" />');
    expect(xml).toContain('<condition attribute="b" operator="not-null" />');
  });

  it("writes order elements", () => {
    const xml = buildFetchXml("account", { orderBy: [{ column: "name" }, { column: "createdon", descending: true }] });
    expect(xml).toBe(
      '<fetch><entity name="account"><order attribute="name" descending="false" /><order attribute="createdon" descending="true" /></entity></fetch>',
    );
  });
});
