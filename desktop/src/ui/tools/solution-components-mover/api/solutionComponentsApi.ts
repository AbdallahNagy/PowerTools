import { apiGet, apiPost } from "../../../shared/api/client";
import type {
  ComponentTypesResponse,
  CopyJob,
  SolutionsResponse,
  StartCopyRequest,
  StartCopyResponse,
} from "../model/types";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

export function fetchSolutions(connectionName: string) {
  return apiGet<SolutionsResponse>("/api/solution-components-mover/solutions", connection(connectionName));
}

export function fetchComponentTypes(connectionName: string) {
  return apiGet<ComponentTypesResponse>(
    "/api/solution-components-mover/component-types",
    connection(connectionName),
  );
}

export function startCopy(connectionName: string, body: StartCopyRequest) {
  return apiPost<StartCopyResponse>("/api/solution-components-mover/copies", body, connection(connectionName));
}

export function fetchCopyJob(connectionName: string, jobId: string) {
  return apiGet<CopyJob>(
    `/api/solution-components-mover/copies/${encodeURIComponent(jobId)}`,
    connection(connectionName),
  );
}
