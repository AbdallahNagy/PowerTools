export interface ArgumentName {
  name: string;
}

export interface Activity {
  pluginTypeId: string;
  name: string;
  typeName: string;
  version: string;
  createdOn: string | null;
  createdBy: string;
  modifiedOn: string | null;
  modifiedBy: string;
  inputs: ArgumentName[];
  outputs: ArgumentName[];
}

export interface AssemblyGroup {
  assemblyId: string;
  name: string;
  activities: Activity[];
}

export interface WorkflowActivitiesResponse {
  assemblies: AssemblyGroup[];
}

export interface ProcessRow {
  workflowId: string;
  name: string;
  category: number | null;
  categoryLabel: string;
  primaryEntity: string;
  createdOn: string | null;
  modifiedOn: string | null;
  onDemand: boolean;
  triggerOnCreate: boolean;
  triggerOnDelete: boolean;
  triggerOnUpdateAttributes: string[];
}

export interface ActivityProcessesResponse {
  activityName: string;
  truncated: boolean;
  processes: ProcessRow[];
}
