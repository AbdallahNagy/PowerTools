export class XmlFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlFormatError";
  }
}

interface Attribute {
  name: string;
  value: string;
}

interface ElementNode {
  kind: "element";
  name: string;
  attributes: Attribute[];
  children: XmlNode[];
}

interface CommentNode {
  kind: "comment";
  value: string;
}

interface TextNode {
  kind: "text";
  value: string;
}

type XmlNode = ElementNode | CommentNode | TextNode;

export function formatXml(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) throw new XmlFormatError("Please check the input XML.");

  const parser = new XmlParser(stripDeclaration(trimmed));
  const nodes = parser.parseChildren(null);
  parser.skipWhitespace();
  if (!parser.eof()) throw new XmlFormatError("Please check the input XML.");
  if (nodes.filter((node) => node.kind === "element").length !== 1) {
    throw new XmlFormatError("Please check the input XML.");
  }

  return nodes.map((node) => printNode(node, 0)).join("\n");
}

export function readPrimaryEntityName(source: string): string | null {
  try {
    const trimmed = source.trim();
    if (!trimmed) return null;
    const parser = new XmlParser(stripDeclaration(trimmed));
    const nodes = parser.parseChildren(null);
    for (const node of nodes) {
      const found = findEntityName(node);
      if (found.found) return found.name;
    }
    return null;
  } catch {
    return null;
  }
}

function findEntityName(
  node: XmlNode,
): { found: true; name: string | null } | { found: false } {
  if (node.kind !== "element") return { found: false };
  if (node.name === "entity") {
    const name = node.attributes.find((attribute) => attribute.name === "name")?.value;
    return { found: true, name: name || null };
  }

  for (const child of node.children) {
    const found = findEntityName(child);
    if (found.found) return found;
  }

  return { found: false };
}

function stripDeclaration(input: string): string {
  if (!input.startsWith("<?")) return input;
  if (!input.startsWith("<?xml")) {
    throw new XmlFormatError("Processing instructions are not supported.");
  }

  const end = input.indexOf("?>");
  if (end < 0) throw new XmlFormatError("Please check the input XML.");
  return input.slice(end + 2).trim();
}

function printNode(node: XmlNode, indent: number): string {
  const pad = "  ".repeat(indent);
  if (node.kind === "comment") return `${pad}<!--${node.value}-->`;
  if (node.kind === "text") return `${pad}${escapeText(node.value)}`;

  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join("");
  const children = node.children.filter((child) => child.kind !== "text" || child.value.length > 0);
  if (children.length === 0) return `${pad}<${node.name}${attributes} />`;

  const only = children[0];
  if (children.length === 1 && only?.kind === "text") {
    return `${pad}<${node.name}${attributes}>${escapeText(only.value)}</${node.name}>`;
  }

  const lines = [`${pad}<${node.name}${attributes}>`];
  for (const child of children) lines.push(printNode(child, indent + 1));
  lines.push(`${pad}</${node.name}>`);
  return lines.join("\n");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll("\"", "&quot;");
}

function decodeEntities(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "&") {
      result += char ?? "";
      continue;
    }

    const end = value.indexOf(";", index);
    if (end < 0) throw new XmlFormatError("Please check the input XML.");
    result += decodeEntity(value.slice(index + 1, end));
    index = end;
  }
  return result;
}

function decodeEntity(token: string): string {
  switch (token) {
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "amp":
      return "&";
    case "quot":
      return "\"";
    case "apos":
      return "'";
    default: {
      const numeric = token.startsWith("#x")
        ? Number.parseInt(token.slice(2), 16)
        : token.startsWith("#")
          ? Number.parseInt(token.slice(1), 10)
          : Number.NaN;
      if (!token.startsWith("#") || !Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff) {
        throw new XmlFormatError("Please check the input XML.");
      }
      return String.fromCodePoint(numeric);
    }
  }
}

class XmlParser {
  private readonly input: string;
  private index = 0;

  constructor(input: string) {
    this.input = input;
  }

  eof(): boolean {
    return this.index >= this.input.length;
  }

  skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.index += 1;
  }

  parseChildren(closingName: string | null): XmlNode[] {
    const nodes: XmlNode[] = [];
    while (!this.eof()) {
      this.skipWhitespace();
      if (this.eof()) break;
      if (this.startsWith("</")) {
        if (closingName === null) throw new XmlFormatError("Please check the input XML.");
        this.expectClose(closingName);
        return nodes;
      }
      if (this.peek() !== "<") {
        const text = this.parseText();
        if (text.value) nodes.push(text);
        continue;
      }
      if (this.startsWith("<!--")) {
        nodes.push(this.parseComment());
        continue;
      }
      if (this.startsWith("<?")) {
        throw new XmlFormatError("Processing instructions are not supported.");
      }
      if (this.startsWith("<![CDATA[")) {
        const text = this.parseCData();
        if (text.value) nodes.push(text);
        continue;
      }
      if (this.startsWith("<!")) throw new XmlFormatError("Please check the input XML.");
      nodes.push(this.parseElement());
    }

    if (closingName !== null) throw new XmlFormatError("Please check the input XML.");
    return nodes;
  }

  private parseElement(): ElementNode {
    this.expect("<");
    const name = this.readName();
    const attributes: Attribute[] = [];
    while (!this.eof()) {
      this.skipWhitespace();
      if (this.startsWith("/>")) {
        this.index += 2;
        return { kind: "element", name, attributes, children: [] };
      }
      if (this.peek() === ">") {
        this.index += 1;
        return { kind: "element", name, attributes, children: this.parseChildren(name) };
      }
      attributes.push(this.parseAttribute());
    }

    throw new XmlFormatError("Please check the input XML.");
  }

  private parseAttribute(): Attribute {
    const name = this.readName();
    if (name === "xmlns") throw new XmlFormatError("XML namespaces are not supported.");
    this.skipWhitespace();
    this.expect("=");
    this.skipWhitespace();
    const quote = this.peek();
    if (quote !== "\"" && quote !== "'") throw new XmlFormatError("Please check the input XML.");
    this.index += 1;
    const end = this.input.indexOf(quote, this.index);
    if (end < 0) throw new XmlFormatError("Please check the input XML.");
    const raw = this.input.slice(this.index, end);
    if (raw.includes("<")) throw new XmlFormatError("Please check the input XML.");
    this.index = end + 1;
    return { name, value: decodeEntities(raw) };
  }

  private parseComment(): CommentNode {
    this.expect("<!--");
    const end = this.input.indexOf("-->", this.index);
    if (end < 0) throw new XmlFormatError("Please check the input XML.");
    const value = this.input.slice(this.index, end);
    if (value.includes("--")) throw new XmlFormatError("Please check the input XML.");
    this.index = end + 3;
    return { kind: "comment", value };
  }

  private parseCData(): TextNode {
    this.expect("<![CDATA[");
    const end = this.input.indexOf("]]>", this.index);
    if (end < 0) throw new XmlFormatError("Please check the input XML.");
    const value = this.input.slice(this.index, end).trim();
    this.index = end + 3;
    return { kind: "text", value };
  }

  private parseText(): TextNode {
    const start = this.index;
    const end = this.input.indexOf("<", this.index);
    if (end < 0) throw new XmlFormatError("Please check the input XML.");
    const value = decodeEntities(this.input.slice(start, end)).trim();
    this.index = end;
    return { kind: "text", value };
  }

  private expectClose(name: string): void {
    this.expect("</");
    const actual = this.readName();
    if (actual !== name) throw new XmlFormatError("Please check the input XML.");
    this.skipWhitespace();
    this.expect(">");
  }

  private readName(): string {
    const start = this.index;
    if (!/[A-Za-z_]/.test(this.peek())) throw new XmlFormatError("Please check the input XML.");
    this.index += 1;
    while (/[A-Za-z0-9_.\-:]/.test(this.peek())) this.index += 1;
    const name = this.input.slice(start, this.index);
    if (name.includes(":")) throw new XmlFormatError("XML namespaces are not supported.");
    return name;
  }

  private expect(token: string): void {
    if (!this.startsWith(token)) throw new XmlFormatError("Please check the input XML.");
    this.index += token.length;
  }

  private startsWith(token: string): boolean {
    return this.input.startsWith(token, this.index);
  }

  private peek(): string {
    return this.input[this.index] ?? "";
  }
}
