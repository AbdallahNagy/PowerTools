export const bulkWorkflowKeys = {
  workflows: (connectionId: string) =>
    ["bulk-workflow-execution", connectionId, "workflows"] as const,
  entities: (connectionId: string) =>
    ["bulk-workflow-execution", connectionId, "entities"] as const,
  views: (connectionId: string, entity: string) =>
    ["bulk-workflow-execution", connectionId, "views", entity] as const,
  run: (connectionId: string, jobId: string) =>
    ["bulk-workflow-execution", connectionId, "run", jobId] as const,
};
