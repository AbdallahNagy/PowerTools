/** One XML element of a RibbonDiffXml or RibbonXml document, as the sidecar sends it. */
export interface RibbonNode {
  name: string;
  attributes: Record<string, string>;
  children: RibbonNode[];
  text?: string | null;
}

/** The diff key for the root RibbonDiffXml. Tables use their logical name. */
export const APPLICATION_KEY = "applicationribbon";

export interface RibbonSolution {
  id: string;
  uniqueName: string;
  friendlyName: string;
  publisherPrefix: string | null;
  version: string | null;
}

export interface SolutionsResponse {
  solutions: RibbonSolution[];
}

export interface RibbonEntity {
  logicalName: string;
  displayName: string;
  ribbonNotSupported: boolean;
  readOnlyReason: string | null;
  diff: RibbonNode | null;
  diffHash: string | null;
}

export interface ApplicationRibbonInfo {
  included: boolean;
  readOnlyReason: string | null;
  diff: RibbonNode | null;
  diffHash: string | null;
}

export interface ComponentCount {
  type: number;
  name: string;
  count: number;
}

export type RuleUsage = "enable" | "display";

export interface RuleAttribute {
  name: string;
  kind: "text" | "enum" | "bool" | "int";
  required: boolean;
  values: string[] | null;
}

export interface RuleType {
  name: string;
  usage: RuleUsage[];
  attributes: RuleAttribute[];
}

export interface LoadResponse {
  solution: RibbonSolution;
  entities: RibbonEntity[];
  applicationRibbon: ApplicationRibbonInfo;
  otherComponents: ComponentCount[];
  canPublish: boolean;
  readOnlyReason: string | null;
  ruleTypes: RuleType[];
}

export interface RibbonTemplate {
  id: string;
  layouts: string[];
}

export interface BaseRibbon {
  entity: string | null;
  tabs: RibbonNode[];
  commands: RibbonNode[];
  enableRules: RibbonNode[];
  displayRules: RibbonNode[];
  templates: RibbonTemplate[];
}

export interface Problem {
  severity: "error" | "warning";
  table: string;
  item: string | null;
  problem: string;
}

export interface ValidateResponse {
  problems: Problem[];
}

export interface DiffsRequest {
  solutionUniqueName: string;
  diffs: Record<string, RibbonNode>;
}

export interface PublishRequest extends DiffsRequest {
  baseHashes: Record<string, string>;
}

export interface PublishStarted {
  jobId: string;
}

export interface PublishTargets {
  entities: string[];
  applicationRibbon: boolean;
}

export type PublishJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "publishFailed"
  | "timedOut"
  | "conflict";

export interface PublishJob {
  status: PublishJobStatus;
  phase: "exporting" | "importing" | "publishing" | "done";
  progress: number;
  message: string | null;
  errors: string[];
  warnings: string[];
  targets: PublishTargets;
}
