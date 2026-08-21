function getOpeningTagName(line: string): string | null {
  const match = /^<([A-Za-z_][\w:.-]*)(?=[\s>])/.exec(line);
  return match?.[1] ?? null;
}

function closesOnSameLine(line: string, tagName: string): boolean {
  return new RegExp(`</${tagName}>$`).test(line);
}

export function formatFetchXml(xml: string): string {
  const raw = xml.trim();
  if (!raw) return "";

  return raw
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .reduce<{ out: string[]; depth: number }>(
      (acc, rawLine) => {
        const line = rawLine.trim();
        const isClose = /^<\//.test(line);
        const isSelf = /\/>$/.test(line);
        const openingTagName = isClose ? null : getOpeningTagName(line);
        const isCompleteElement = openingTagName ? closesOnSameLine(line, openingTagName) : false;

        if (isClose && acc.depth > 0) acc.depth--;
        acc.out.push("  ".repeat(acc.depth) + line);
        if (openingTagName && !isSelf && !isCompleteElement) acc.depth++;

        return acc;
      },
      { out: [], depth: 0 },
    )
    .out.join("\n");
}
