import { WEB_RESOURCE_TYPE } from "./types";

export type Properties = Record<string, unknown>;

export interface ParsedProperties {
  /** False when the text is not JSON, or is JSON of a shape that has no properties. */
  ok: boolean;
  properties: Properties;
}

export type PropertyStatus = "different" | "onlyLeft" | "onlyRight" | "equal";

export interface PropertyDiff {
  key: string;
  status: PropertyStatus;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(entry: Record<string, unknown>, name: string): unknown {
  if (name in entry) return entry[name];
  const lower = name.toLowerCase();
  const match = Object.keys(entry).find((key) => key.toLowerCase() === lower);
  return match === undefined ? undefined : entry[match];
}

/**
 * Reads a layer's component JSON into a property map. The documented shape is
 * { "Attributes": [ { "Key": ..., "Value": ... } ] }; a plain object is read by its own keys.
 * Empty text is a layer with no properties. Anything else is reported as unreadable.
 */
export function parseComponentJson(raw: string | null | undefined): ParsedProperties {
  if (raw == null || raw.trim() === "") return { ok: true, properties: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, properties: {} };
  }
  if (!isPlainObject(parsed)) return { ok: false, properties: {} };

  const attributes = readField(parsed, "Attributes");
  if (Array.isArray(attributes)) {
    const properties: Properties = {};
    for (const entry of attributes) {
      if (!isPlainObject(entry)) continue;
      const key = readField(entry, "Key");
      if (typeof key !== "string" || key === "") continue;
      properties[key] = readField(entry, "Value");
    }
    return { ok: true, properties };
  }

  return { ok: true, properties: { ...parsed } };
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => key in right && deepEqual(left[key], right[key]));
  }
  return false;
}

/** Pairs the two layers' properties by key and flags each one. */
export function diffProperties(left: Properties, right: Properties): PropertyDiff[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].map((key) => {
    const inLeft = key in left;
    const inRight = key in right;
    let status: PropertyStatus;
    if (!inRight) status = "onlyLeft";
    else if (!inLeft) status = "onlyRight";
    else status = deepEqual(left[key], right[key]) ? "equal" : "different";
    return { key, status };
  });
}

/** Pretty-prints JSON text; returns other text unchanged. */
export function prettyText(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON: show it as written.
  }
  return raw;
}

/** One property value as text for the diff. Strings holding JSON are pretty-printed. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return prettyText(value);
  return JSON.stringify(value, null, 2);
}

/** Decodes base64 to UTF-8 text without a byte order mark. Null when the text is not base64. */
export function decodeBase64Text(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  if (compact === "" || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) return null;
  try {
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return null;
  }
}

export function isWebResourceContent(componentType: number, key: string): boolean {
  return componentType === WEB_RESOURCE_TYPE && key.toLowerCase() === "content";
}

export interface DiffValue {
  text: string;
  decoded: boolean;
}

/** The text shown for one side of a property diff. Web resource content is decoded first. */
export function diffValue(componentType: number, key: string, value: unknown): DiffValue {
  if (isWebResourceContent(componentType, key) && typeof value === "string") {
    const decoded = decodeBase64Text(value);
    if (decoded !== null) return { text: prettyText(decoded), decoded: true };
  }
  return { text: formatValue(value), decoded: false };
}
