import type {
  AttributeInfo,
  DeletedRecord,
  DeletedResponse,
  RecordResponse,
  StatusResponse,
  TablesResponse,
  UsersResponse,
} from "../model/types";

export const userAvery = "bbbbbbbb-0000-0000-0000-000000000001";
export const userFlow = "bbbbbbbb-0000-0000-0000-000000000002";

export const statusFixture: StatusResponse = {
  bin: { state: "enabled", reason: null, retentionDays: 30 },
  audit: { state: "enabled", reason: null, retentionDays: 90 },
};

export const tablesFixture: TablesResponse = {
  tables: [
    {
      logicalName: "account",
      displayName: "Account",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
      binEnabled: true,
      auditEnabled: true,
      isActivity: false,
      retentionDays: 30,
    },
    {
      logicalName: "new_project",
      displayName: "Project",
      primaryIdAttribute: "new_projectid",
      primaryNameAttribute: "new_name",
      binEnabled: false,
      auditEnabled: true,
      isActivity: false,
      retentionDays: null,
    },
  ],
};

export const usersFixture: UsersResponse = {
  users: [
    { id: userFlow, fullName: "Flow Integration", isDisabled: false },
    { id: userAvery, fullName: "Avery Admin", isDisabled: true },
  ],
  truncated: false,
};

function auditRow(index: number, name: string | null, deletedOn: string, recordId?: string): DeletedRecord {
  const audit = `aaaaaaaa-0000-0000-0000-00000000000${index}`;
  return {
    key: audit,
    recordId: recordId ?? `11111111-0000-0000-0000-00000000000${index}`,
    table: "new_project",
    name,
    deletedOn,
    deletedById: userAvery,
    deletedBy: "Avery Admin",
    callingUserId: null,
    callingUser: null,
    auditId: audit,
    hasValues: name !== null,
  };
}

export const projectAlpha = auditRow(1, "Alpha", "2026-10-02T08:30:00Z");
export const projectBeta = auditRow(2, "Beta", "2026-10-03T08:30:00Z");
export const projectNoValues = auditRow(3, null, "2026-10-01T08:30:00Z");
/** An older deletion of the same record as Alpha. */
export const projectAlphaEarlier = auditRow(4, "Alpha", "2026-09-20T08:30:00Z", projectAlpha.recordId);

export const auditPageFixture: DeletedResponse = {
  records: [projectBeta, projectAlpha, projectNoValues],
  pagingCookie: "<cookie page=\"1\" />",
  moreRecords: true,
  page: 1,
};

export const auditSecondPageFixture: DeletedResponse = {
  records: [projectAlphaEarlier],
  pagingCookie: null,
  moreRecords: false,
  page: 2,
};

export const binAccount: DeletedRecord = {
  key: "22222222-0000-0000-0000-000000000001",
  recordId: "22222222-0000-0000-0000-000000000001",
  table: "account",
  name: "Contoso",
  deletedOn: "2026-10-05T10:00:00Z",
  deletedById: userFlow,
  deletedBy: "Flow Integration",
  callingUserId: null,
  callingUser: null,
  auditId: null,
  hasValues: true,
};

export const binPageFixture: DeletedResponse = {
  records: [binAccount],
  pagingCookie: null,
  moreRecords: false,
  page: 1,
};

export const alphaValues: RecordResponse = {
  fields: [
    { logicalName: "new_name", kind: "string", value: "Alpha", formatted: null, lookupTable: null },
    { logicalName: "new_phase", kind: "choice", value: "2", formatted: null, lookupTable: null },
    { logicalName: "new_isbillable", kind: "boolean", value: "true", formatted: null, lookupTable: null },
    {
      logicalName: "new_accountid",
      kind: "lookup",
      value: binAccount.recordId,
      formatted: "Contoso",
      lookupTable: "account",
    },
  ],
};

export const projectAttributes: AttributeInfo[] = [
  { logicalName: "new_name", displayName: "Name", attributeType: "String" },
  {
    logicalName: "new_phase",
    displayName: "Phase",
    attributeType: "Picklist",
    optionSet: [
      { value: 1, label: "Plan" },
      { value: 2, label: "Build" },
    ],
  },
  { logicalName: "new_isbillable", displayName: "Billable", attributeType: "Boolean" },
  { logicalName: "new_accountid", displayName: "Account", attributeType: "Lookup" },
];
