import type { EffectClass } from "../communityTools/messageEffects.js";

export interface ActivityEntry {
  time: string;
  client: string | null;
  tool: string;
  connection: string | null;
  effect: EffectClass;
  /** Widens in phase 3, when changes and destructive calls can ask the user. */
  approval: "not-needed";
  outcome: "ok" | "error";
  code?: string;
  summary: string;
}

export interface ActivityLog {
  append(entry: ActivityEntry): Promise<void>;
  recent(limit: number): Promise<ActivityEntry[]>;
  prune(): Promise<void>;
}
