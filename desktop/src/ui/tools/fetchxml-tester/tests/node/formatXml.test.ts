import { describe, expect, it } from "vitest";
import { formatXml, readPrimaryEntityName, XmlFormatError } from "../../model/formatXml";
import { SAMPLE_FETCH_XML } from "../../model/sampleQuery";

describe("formatXml", () => {
  it("keeps the sample query stable and preserves comments", () => {
    expect(formatXml(SAMPLE_FETCH_XML)).toBe(SAMPLE_FETCH_XML);
    expect(formatXml(`<?xml version="1.0"?><fetch><entity name="account"><!-- owner --><attribute name="name" /></entity></fetch>`)).toBe([
      "<fetch>",
      "  <entity name=\"account\">",
      "    <!-- owner -->",
      "    <attribute name=\"name\" />",
      "  </entity>",
      "</fetch>",
    ].join("\n"));
  });

  it("keeps comments that sit beside the root and escapes text", () => {
    expect(formatXml("<!-- draft --><fetch><entity name=\"new_widget\"><attribute name=\"name\" /></entity></fetch>")).toBe([
      "<!-- draft -->",
      "<fetch>",
      "  <entity name=\"new_widget\">",
      "    <attribute name=\"name\" />",
      "  </entity>",
      "</fetch>",
    ].join("\n"));

    expect(formatXml("<fetch><entity name=\"account\"><filter><condition attribute=\"name\" operator=\"eq\" value=\"a &amp; b\" /></filter></entity></fetch>")).toContain(
      'value="a &amp; b"',
    );
  });

  it("rejects empty XML, namespaces, and processing instructions", () => {
    expect(() => formatXml("   ")).toThrow(XmlFormatError);
    expect(() => formatXml("<fetch xmlns=\"http://example.test\"></fetch>")).toThrow(
      "XML namespaces are not supported.",
    );
    expect(() => formatXml("<fetch><?pi ?><entity name=\"account\" /></fetch>")).toThrow(
      "Processing instructions are not supported.",
    );
  });

  it("reads the primary entity name, including names that contain underscores", () => {
    expect(readPrimaryEntityName("<fetch><entity name=\"new_widget\"><attribute name=\"name\" /></entity></fetch>")).toBe(
      "new_widget",
    );
    expect(readPrimaryEntityName("<fetch></fetch>")).toBeNull();
    expect(readPrimaryEntityName("<fetch")).toBeNull();
  });
});
