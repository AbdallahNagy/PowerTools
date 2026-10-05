import type { EntitySummary, RunState, ViewsResponse, WorkflowsResponse } from "../model/types";

export const approveId = "20000000-0000-0000-0000-000000000001";
export const recalcId = "20000000-0000-0000-0000-000000000002";
export const jobId = "30000000-0000-0000-0000-000000000001";

export const activeAccountsFetch =
  '<fetch><entity name="account"><attribute name="name" /><filter><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>';
export const myAccountsFetch =
  '<fetch><entity name="account"><attribute name="name" /></entity></fetch>';

export const workflowsFixture: WorkflowsResponse = {
  workflows: [
    {
      id: approveId,
      name: "Approve account",
      primaryEntity: "account",
      mode: "background",
      runAs: "owner",
      scope: "organization",
      isManaged: false,
      asyncAutoDelete: true,
    },
    {
      id: recalcId,
      name: "Recalculate contact",
      primaryEntity: "contact",
      mode: "realtime",
      runAs: "callingUser",
      scope: "user",
      isManaged: true,
      asyncAutoDelete: false,
    },
  ],
};

export const entitiesFixture: EntitySummary[] = [
  { logicalName: "account", displayName: "Account" },
  { logicalName: "contact", displayName: "Contact" },
];

export const accountViewsFixture: ViewsResponse = {
  views: [
    { id: "40000000-0000-0000-0000-000000000002", name: "My Accounts", kind: "personal", fetchXml: myAccountsFetch },
    { id: "40000000-0000-0000-0000-000000000001", name: "Active Accounts", kind: "system", fetchXml: activeAccountsFetch },
  ],
};

export function runFixture(overrides: Partial<RunState> = {}): RunState {
  return {
    status: "running",
    total: 1284,
    processed: 200,
    succeeded: 199,
    failed: 1,
    errors: [{ recordId: "50000000-0000-0000-0000-000000000001", message: "Missing privilege (0x80040220)" }],
    errorsCapped: false,
    startedAt: "2026-10-05T10:00:00.0000000+00:00",
    estimatedSecondsRemaining: 190,
    message: null,
    ...overrides,
  };
}
