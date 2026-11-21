import importSpec from "../schemas/solution_import.input.json" with { type: "json" };
import { dataverseResult } from "../results.js";
import type { AgentTool } from "../types.js";
import { applyTool } from "./applyTool.js";
import { AGENT_API, bodyOf, connectionProp } from "./common.js";

const str = (value: unknown) => String(value);
const fileName = (path: unknown) => str(path).split(/[\\/]/).pop() ?? str(path);

/** solution_export: writes a solution to a new .zip on this computer. It never overwrites a file. */
export const solutionExport: AgentTool = {
  name: "solution_export",
  group: "solutions",
  title: "Export a solution",
  description:
    "Read-only. Exports an unmanaged solution, as managed or unmanaged, to a new .zip on this computer and answers its path. Changes nothing in the environment and never overwrites a file. Default folder: Documents\\Power Tools\\Solutions. Only published customizations are exported.",
  inputSchema: {
    type: "object",
    properties: {
      solution: { type: "string", minLength: 1, description: "Unique name of the unmanaged solution." },
      managed: { type: "boolean", description: "Export as managed. Default false." },
      folder: { type: "string", minLength: 1, description: "Absolute folder to write into." },
      connection: connectionProp,
    },
    required: ["solution"],
    additionalProperties: false,
  },
  effect: "read",
  reportsProgress: true,
  summarize: (args) => `solution_export ${str(args.solution)}`,
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const data = await ctx.callSidecar(conn, "POST", `${AGENT_API}/solution/export`, bodyOf(args), ctx.signal);
    return dataverseResult(`Exported ${str(args.solution)}.`, { result: data }, conn.displayName);
  },
};

/** solution_import: always destructive, because an import can overwrite customizations. */
export const solutionImport: AgentTool = applyTool({
  name: "solution_import",
  family: "solution_import",
  group: "solutions",
  title: "Import a solution",
  description:
    "Destructive: imports a solution .zip from this computer, which can overwrite customizations. Always asks. Waits for the import and reports the import job's error. Modes: update (default), upgrade and stage for managed solutions. Importing the installed version changes nothing unless force. Also the route for canvas apps, PCF controls and ribbons.",
  spec: importSpec,
  reportsProgress: true,
  describe: (args) => `import solution file ${fileName(args.path)}`,
  summarize: (args) => `solution_import ${fileName(args.path)}`,
});
