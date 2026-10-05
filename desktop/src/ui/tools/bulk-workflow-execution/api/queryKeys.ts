export const bulkWorkflowKeys = {
  workflows: (connectionName: string) =>
    ["bulk-workflow-execution", connectionName, "workflows"] as const,
  entities: (connectionName: string) =>
    ["bulk-workflow-execution", connectionName, "entities"] as const,
  views: (connectionName: string, entity: string) =>
    ["bulk-workflow-execution", connectionName, "views", entity] as const,
  run: (connectionName: string, jobId: string) =>
    ["bulk-workflow-execution", connectionName, "run", jobId] as const,
};
