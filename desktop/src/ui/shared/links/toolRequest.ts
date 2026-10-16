// Tool requests are GitHub issues opened from .github/ISSUE_TEMPLATE/tool-request.yml.
// The query keys below are the form's field ids, so GitHub fills those fields in.
// The website imports this module too.

export const TOOL_REQUEST_ISSUE_URL =
  "https://github.com/AbdallahNagy/PowerTools/issues/new";

const TITLE_PREFIX = "[Tool request]: ";

export interface ToolRequestFields {
  name?: string;
  problem?: string;
  xrmToolBoxPlugin?: string;
  /** Where the request came from, such as "website" or "desktop 1.2.0". */
  source?: string;
}

export function buildToolRequestUrl(fields: ToolRequestFields = {}): string {
  const params = new URLSearchParams({ template: "tool-request.yml" });
  const name = fields.name?.trim();
  params.set("title", `${TITLE_PREFIX}${name ?? ""}`);
  const values: [string, string | undefined][] = [
    ["tool-name", name],
    ["problem", fields.problem?.trim()],
    ["xrmtoolbox-plugin", fields.xrmToolBoxPlugin?.trim()],
    ["source", fields.source?.trim()],
  ];
  for (const [key, value] of values) {
    if (value) params.set(key, value);
  }
  return `${TOOL_REQUEST_ISSUE_URL}?${params.toString()}`;
}
