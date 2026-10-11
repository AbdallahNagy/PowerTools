export const WEB_RESOURCE_TYPE = 61;
export const COLUMN_TYPE = 2;
export const FORM_TYPE = 60;
export const VIEW_TYPE = 26;

export interface ComponentTypeInfo {
  componentType: number;
  name: string;
  layerName: string;
  label: string;
  supported: boolean;
}

export interface ComponentTypesResponse {
  componentTypes: ComponentTypeInfo[];
}

export interface ComponentRow {
  componentId: string;
  componentType: number;
  name: string;
  logicalName: string;
  parentEntity: string | null;
}

export interface ComponentsResponse {
  components: ComponentRow[];
  truncated: boolean;
}

export interface Layer {
  id: string;
  order: number;
  solutionName: string;
  solutionVersion: string | null;
  publisherName: string;
  overwriteTime: string | null;
  name: string;
  isActive: boolean;
  changes: string | null;
  componentJson: string | null;
  children: string | null;
}

export interface LayersResponse {
  componentId: string;
  componentType: number;
  layerName: string;
  hasActiveLayer: boolean;
  canRemoveActive: boolean;
  layers: Layer[];
}

export type RemovalResult = "Removed" | "Skipped" | "Failed";

export interface RemovalEntry {
  componentId: string;
  name: string;
  result: RemovalResult;
  detail: string;
}
