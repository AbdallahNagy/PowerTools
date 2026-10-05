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

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

/** Non-idempotent calls must not be replayed by the 401 refresh. */
function mutation(connectionName: string) {
  return { meta: { connectionName, noAuthRetry: true } };
}

export function fetchWorkflows(connectionName: string) {
  return apiGet<WorkflowsResponse>(`${base}/workflows`, connection(connectionName));
}

export function fetchViews(connectionName: string, entity: string) {
  return apiGet<ViewsResponse>(
    `${base}/views?entity=${encodeURIComponent(entity)}`,
    connection(connectionName),
  );
}

export function fetchEntities(connectionName: string) {
  return apiGet<EntitySummary[]>("/api/metadata/entities", connection(connectionName));
}

export function countRecords(connectionName: string, body: CountRequest) {
  return apiPost<CountResponse>(`${base}/count`, body, connection(connectionName));
}

export function startRun(connectionName: string, body: StartRunRequest) {
  return apiPost<StartRunResponse>(`${base}/runs`, body, mutation(connectionName));
}

export function fetchRun(connectionName: string, jobId: string) {
  return apiGet<RunState>(`${base}/runs/${encodeURIComponent(jobId)}`, connection(connectionName));
}

export function cancelRun(connectionName: string, jobId: string) {
  return apiPost<RunState>(
    `${base}/runs/${encodeURIComponent(jobId)}/cancel`,
    undefined,
    connection(connectionName),
  );
}
