import type { AgentTool } from "../types.js";
import {
  choiceApply,
  configApply,
  formApply,
  pluginDeploy,
  pluginStepApply,
  remove,
  solutionApply,
  viewApply,
} from "./components.js";
import { connectionsList } from "./connections.js";
import { inspectSolution, inspectUi, recordsQuery } from "./read.js";
import { executeMessage, recordsDelete, recordsWrite } from "./records.js";
import { solutionExport, solutionImport } from "./solutionFileTools.js";
import { inspectSchema, tableApply } from "./tableTools.js";

/**
 * Every agent tool, in the order clients list them: reads first, then changes, then destructive tools
 * (desktop/docs/mcp-tool-architecture.md). The tool budget test measures this list.
 */
export const AGENT_TOOLS: AgentTool[] = [
  connectionsList,
  inspectSchema,
  inspectUi,
  inspectSolution,
  recordsQuery,
  solutionExport,
  recordsWrite,
  tableApply,
  choiceApply,
  formApply,
  viewApply,
  pluginDeploy,
  pluginStepApply,
  solutionApply,
  configApply,
  executeMessage,
  recordsDelete,
  remove,
  solutionImport,
];
