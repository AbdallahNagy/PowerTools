import type { ActivityProcessesResponse, WorkflowActivitiesResponse } from "../model/types";

export const activitiesFixture: WorkflowActivitiesResponse = {
  assemblies: [
    {
      assemblyId: "assembly-a",
      name: "A.Shared",
      activities: [
        {
          pluginTypeId: "type-3",
          name: "Contoso helper",
          typeName: "A.Shared.Helper, A.Shared",
          version: "1.0.0.0",
          createdOn: "2024-01-02T03:04:00.000Z",
          createdBy: "Ada Lovelace",
          modifiedOn: "2024-01-03T03:04:00.000Z",
          modifiedBy: "Grace Hopper",
          inputs: [],
          outputs: [],
        },
      ],
    },
    {
      assemblyId: "assembly-b",
      name: "Contoso.Activities",
      activities: [
        {
          pluginTypeId: "type-1",
          name: "Add note",
          typeName: "Contoso.Activities.AddNote, Contoso.Activities, Version=1.0.0.0",
          version: "1.0.0.0",
          createdOn: "2024-03-15T14:30:00.000Z",
          createdBy: "Ada Lovelace",
          modifiedOn: "2024-04-01T09:00:00.000Z",
          modifiedBy: "Grace Hopper",
          inputs: [{ name: "Account" }],
          outputs: [{ name: "NoteId" }],
        },
        {
          pluginTypeId: "type-2",
          name: "Send reminder",
          typeName: "Contoso.Activities.SendReminder",
          version: "2.0.0.0",
          createdOn: null,
          createdBy: "",
          modifiedOn: null,
          modifiedBy: "",
          inputs: [],
          outputs: [{ name: "Sent" }],
        },
      ],
    },
  ],
};

export const processesFixture: ActivityProcessesResponse = {
  activityName: "Add note",
  truncated: false,
  processes: [
    {
      workflowId: "wf-1",
      name: "Escalate case",
      category: 0,
      categoryLabel: "Workflow",
      primaryEntity: "incident",
      createdOn: "2024-05-01T12:00:00.000Z",
      modifiedOn: "2024-05-02T08:15:00.000Z",
      onDemand: true,
      triggerOnCreate: true,
      triggerOnDelete: true,
      triggerOnUpdateAttributes: ["statuscode", "ownerid"],
    },
    {
      workflowId: "wf-2",
      name: "Global close",
      category: 3,
      categoryLabel: "",
      primaryEntity: "",
      createdOn: null,
      modifiedOn: null,
      onDemand: false,
      triggerOnCreate: false,
      triggerOnDelete: false,
      triggerOnUpdateAttributes: [],
    },
  ],
};

export const emptyProcessesFixture: ActivityProcessesResponse = {
  activityName: "Contoso helper",
  truncated: false,
  processes: [],
};

export const otherEnvironmentFixture: WorkflowActivitiesResponse = {
  assemblies: [
    {
      assemblyId: "assembly-other",
      name: "Other.Assembly",
      activities: [
        {
          pluginTypeId: "type-other",
          name: "Other activity",
          typeName: "Other.Activity",
          version: "1.0.0.0",
          createdOn: null,
          createdBy: "Sam",
          modifiedOn: null,
          modifiedBy: "Sam",
          inputs: [],
          outputs: [],
        },
      ],
    },
  ],
};
