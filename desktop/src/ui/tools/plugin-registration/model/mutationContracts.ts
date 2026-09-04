export interface MutationIssue {
  code: string;
  message: string;
}

export interface MutationChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface MutationConfirmation {
  message: string;
  level?: string;
  requiredText?: string | null;
  requiresAcknowledgement?: boolean;
}

export interface MutationPlan {
  token: string;
  blockers: MutationIssue[];
  warnings: MutationIssue[];
  changes: MutationChange[];
  confirmation: MutationConfirmation;
}
