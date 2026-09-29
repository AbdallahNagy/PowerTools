export const workflowActivityKeys = {
  activities: (connectionName: string) =>
    ["workflow-activities-viewer", connectionName, "activities"] as const,
  processes: (connectionName: string, pluginTypeId: string) =>
    ["workflow-activities-viewer", connectionName, "processes", pluginTypeId] as const,
};
