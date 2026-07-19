export interface DynamicsRecordUrlInput {
  envUrl: string;
  entityLogicalName: string;
  recordId: string;
}

export function buildDynamicsRecordUrl({
  envUrl,
  entityLogicalName,
  recordId,
}: DynamicsRecordUrlInput): string {
  const baseUrl = envUrl.replace(/\/+$/, "");
  const cleanRecordId = recordId.replace(/[{}]/g, "");
  const params = new URLSearchParams({
    etn: entityLogicalName,
    pagetype: "entityrecord",
    id: cleanRecordId,
  });

  return `${baseUrl}/main.aspx?${params.toString()}`;
}
