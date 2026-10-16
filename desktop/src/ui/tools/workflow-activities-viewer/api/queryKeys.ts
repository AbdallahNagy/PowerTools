export const workflowActivityKeys = {
  activities: (connectionId: string) =>
    ["workflow-activities-viewer", connectionId, "activities"] as const,
  processes: (connectionId: string, pluginTypeId: string) =>
    ["workflow-activities-viewer", connectionId, "processes", pluginTypeId] as const,
};
