function baseUrl(envUrl: string): string {
  return envUrl.replace(/\/+$/, "");
}

export interface DynamicsRecordUrlInput {
  envUrl: string;
  entityLogicalName: string;
  recordId: string;
}

/** The model-driven app page for one record. */
export function buildDynamicsRecordUrl({
  envUrl,
  entityLogicalName,
  recordId,
}: DynamicsRecordUrlInput): string {
  const cleanRecordId = recordId.replace(/[{}]/g, "");
  const params = new URLSearchParams({
    etn: entityLogicalName,
    pagetype: "entityrecord",
    id: cleanRecordId,
  });

  return `${baseUrl(envUrl)}/main.aspx?${params.toString()}`;
}

/** The classic solution editor for one solution. */
export function solutionEditorUrl(envUrl: string, solutionId: string): string {
  return `${baseUrl(envUrl)}/tools/solution/edit.aspx?id=${solutionId}`;
}
