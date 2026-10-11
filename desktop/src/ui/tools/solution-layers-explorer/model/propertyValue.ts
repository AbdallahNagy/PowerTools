import { decodeBase64Text, isWebResourceContent } from "./componentJson";

export type ValueFormat = "empty" | "text" | "json" | "xml";

export interface DisplayValue {
  /** The full value as shown in the value pane and the diff. */
  text: string;
  format: ValueFormat;
  /** True when web resource content was decoded from base64. */
  decoded: boolean;
}

/** Longest value shown in full in a table cell. Longer or multi-line values show a preview. */
export const SHORT_VALUE_LENGTH = 80;

function looksLikeXml(text: string): boolean {
  return /^<[A-Za-z?!]/.test(text) && text.endsWith(">");
}

/**
 * Indents XML one level per element so it reads like a code editor. It works on
 * the tags as text, so it never fails: markup it cannot follow keeps its order.
 */
export function formatXml(xml: string): string {
  const tokens = xml.trim().match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? [];
  const lines: string[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (!token.startsWith("<")) {
      const text = token.trim();
      if (text !== "") lines.push(`${"  ".repeat(depth)}${text}`);
      continue;
    }
    const isClosing = token.startsWith("</");
    const isOpening = !isClosing && !token.endsWith("/>") && !/^<[?!]/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    // Keep <tag>text</tag> on one line.
    const text = tokens[index + 1];
    const close = tokens[index + 2];
    if (isOpening && text !== undefined && !text.startsWith("<") && close?.startsWith("</")) {
      lines.push(`${"  ".repeat(depth)}${token}${text.trim()}${close}`);
      index += 2;
      continue;
    }
    lines.push(`${"  ".repeat(depth)}${token}`);
    if (isOpening) depth += 1;
  }
  return lines.join("\n");
}

function formatString(value: string): { text: string; format: ValueFormat } {
  const trimmed = value.trim();
  if (trimmed === "") return { text: "", format: "empty" };
  if (looksLikeXml(trimmed)) return { text: formatXml(trimmed), format: "xml" };
  if (/^[[{]/.test(trimmed)) {
    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), format: "json" };
    } catch {
      // Not JSON: show it as written.
    }
  }
  return { text: value, format: "text" };
}

/** How one property value is shown: XML and JSON are formatted, web resource content is decoded. */
export function displayValue(componentType: number, key: string, value: unknown): DisplayValue {
  if (value === undefined || value === null) return { text: "", format: "empty", decoded: false };
  if (typeof value === "string") {
    if (isWebResourceContent(componentType, key)) {
      const decoded = decodeBase64Text(value);
      if (decoded !== null) return { ...formatString(decoded), decoded: true };
    }
    return { ...formatString(value), decoded: false };
  }
  if (typeof value === "object") return { text: JSON.stringify(value, null, 2), format: "json", decoded: false };
  return { text: String(value), format: "text", decoded: false };
}

/** Compact one-line form of a value, or null when it does not fit in a table cell. */
export function shortValue(componentType: number, key: string, value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (isWebResourceContent(componentType, key)) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("\n") || text.length > SHORT_VALUE_LENGTH) return null;
  return text;
}

/** What a table cell shows: the value itself when short, otherwise a size summary. */
export function valueSummary(componentType: number, key: string, value: unknown): string {
  const short = shortValue(componentType, key, value);
  if (short !== null) return short;
  const shown = displayValue(componentType, key, value);
  const lines = shown.text.split("\n").length;
  const kind = { empty: "Text", text: "Text", json: "JSON", xml: "XML" }[shown.format];
  const size = lines > 1 ? `${lines.toLocaleString()} lines` : `${shown.text.length.toLocaleString()} characters`;
  return `${shown.decoded ? "Decoded " : ""}${kind} · ${size}`;
}
