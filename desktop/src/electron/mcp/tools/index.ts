import type { AgentTool } from "../types.js";
import { connectionsList } from "./connections.js";
import {
  metadataGetChoices,
  metadataGetTable,
  metadataListColumns,
  metadataListRelationships,
  metadataListTables,
} from "./metadata.js";
import { recordsGet, recordsQuery } from "./records.js";

export const READ_TOOLS: AgentTool[] = [
  connectionsList,
  metadataListTables,
  metadataGetTable,
  metadataListColumns,
  metadataListRelationships,
  metadataGetChoices,
  recordsQuery,
  recordsGet,
];
