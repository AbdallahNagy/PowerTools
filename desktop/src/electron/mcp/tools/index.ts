import type { AgentTool } from "../types.js";
import { connectionsList } from "./connections.js";
import {
  metadataGetChoices,
  metadataGetTable,
  metadataListColumns,
  metadataListForms,
  metadataListRelationships,
  metadataListTables,
  metadataListViews,
} from "./metadata.js";
import { recordsGet, recordsQuery } from "./records.js";
import { solutionExport, solutionImport } from "./solutionFileTools.js";
import { inspectSchema, tableApply } from "./tableTools.js";

export const READ_TOOLS: AgentTool[] = [
  connectionsList,
  metadataListTables,
  metadataGetTable,
  metadataListColumns,
  metadataListRelationships,
  metadataGetChoices,
  metadataListForms,
  metadataListViews,
  recordsQuery,
  recordsGet,
];

/**
 * The consolidated plan/apply tool set that replaces the tools above (desktop/docs/mcp-tool-architecture.md).
 * Phase 1 is the pilot: table_apply, inspect_schema, solution_export and solution_import. Phase 2 adds the rest and
 * deletes the old tools. The tool budget test measures this list.
 */
export const PLAN_APPLY_TOOLS: AgentTool[] = [inspectSchema, tableApply, solutionExport, solutionImport];
