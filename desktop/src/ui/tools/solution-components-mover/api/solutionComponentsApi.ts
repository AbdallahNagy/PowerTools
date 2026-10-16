import { apiGet, apiPost } from "../../../shared/api/client";
import type {
  ComponentTypesResponse,
  CopyJob,
  SolutionsResponse,
  StartCopyRequest,
  StartCopyResponse,
} from "../model/types";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

export function fetchSolutions(connectionId: string) {
  return apiGet<SolutionsResponse>("/api/solution-components-mover/solutions", connection(connectionId));
}

export function fetchComponentTypes(connectionId: string) {
  return apiGet<ComponentTypesResponse>(
    "/api/solution-components-mover/component-types",
    connection(connectionId),
  );
}

export function startCopy(connectionId: string, body: StartCopyRequest) {
  return apiPost<StartCopyResponse>("/api/solution-components-mover/copies", body, connection(connectionId));
}

export function fetchCopyJob(connectionId: string, jobId: string) {
  return apiGet<CopyJob>(
    `/api/solution-components-mover/copies/${encodeURIComponent(jobId)}`,
    connection(connectionId),
  );
}
