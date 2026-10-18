import { apiGet, apiPost } from "../../../shared/api/client";
import type {
  CountRequest,
  CountResponse,
  EntitySummary,
  RunState,
  StartRunRequest,
  StartRunResponse,
  ViewsResponse,
  WorkflowsResponse,
} from "../model/types";

const base = "/api/bulk-workflow-execution";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

/** Non-idempotent calls must not be replayed by the 401 refresh. */
function mutation(connectionId: string) {
  return { meta: { connectionId, noAuthRetry: true } };
}

export function fetchWorkflows(connectionId: string) {
  return apiGet<WorkflowsResponse>(`${base}/workflows`, connection(connectionId));
}

export function fetchViews(connectionId: string, entity: string) {
  return apiGet<ViewsResponse>(
    `${base}/views?entity=${encodeURIComponent(entity)}`,
    connection(connectionId),
  );
}

export function fetchEntities(connectionId: string) {
  return apiGet<EntitySummary[]>("/api/metadata/entities", connection(connectionId));
}

export function countRecords(connectionId: string, body: CountRequest) {
  return apiPost<CountResponse>(`${base}/count`, body, connection(connectionId));
}

export function startRun(connectionId: string, body: StartRunRequest) {
  return apiPost<StartRunResponse>(`${base}/runs`, body, mutation(connectionId));
}

export function fetchRun(connectionId: string, jobId: string) {
  return apiGet<RunState>(`${base}/runs/${encodeURIComponent(jobId)}`, connection(connectionId));
}

export function cancelRun(connectionId: string, jobId: string) {
  return apiPost<RunState>(
    `${base}/runs/${encodeURIComponent(jobId)}/cancel`,
    undefined,
    connection(connectionId),
  );
}
