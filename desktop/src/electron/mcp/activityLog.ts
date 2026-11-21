import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { EffectClass } from "../communityTools/messageEffects.js";

export interface ActivityEntry {
  time: string;
  client: string | null;
  tool: string;
  connection: string | null;
  effect: EffectClass;
  approval: "not-needed" | "auto" | "allowed" | "denied" | "timed-out" | "unavailable" | "cancelled";
  outcome: "ok" | "error";
  code?: string;
  summary: string;
  /** For apply tools: the hash of the plan that was approved, and its steps, so the user can see what ran. */
  planHash?: string;
  steps?: Array<{ op: string; target: string; effect: string }>;
}

export interface ActivityLog {
  append(entry: ActivityEntry): Promise<void>;
  recent(limit: number): Promise<ActivityEntry[]>;
  prune(): Promise<void>;
}

const MAX_SUMMARY = 200;
const MAX_STEPS = 50;
const MAX_STEP_TEXT = 120;
const RETENTION_DAYS = 30;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** Copies only the known fields, so nothing extra (such as a secret) can reach the file. */
function sanitize(entry: ActivityEntry): ActivityEntry {
  return {
    time: entry.time,
    client: entry.client,
    tool: entry.tool,
    connection: entry.connection,
    effect: entry.effect,
    approval: entry.approval,
    outcome: entry.outcome,
    ...(entry.code ? { code: entry.code } : {}),
    summary: entry.summary.slice(0, MAX_SUMMARY),
    ...(entry.planHash ? { planHash: entry.planHash.slice(0, 64) } : {}),
    ...(entry.steps
      ? {
          steps: entry.steps.slice(0, MAX_STEPS).map((step) => ({
            op: String(step.op).slice(0, MAX_STEP_TEXT),
            target: String(step.target).slice(0, MAX_STEP_TEXT),
            effect: String(step.effect).slice(0, 16),
          })),
        }
      : {}),
  };
}

/** One JSON line per call in `<dir>/<YYYY-MM-DD>.jsonl`, kept for 30 days. */
export function createActivityLog(dir: string, now: () => Date = () => new Date()): ActivityLog {
  async function dayFiles(): Promise<string[]> {
    try {
      return (await readdir(dir)).filter((name) => DAY_FILE.test(name)).sort();
    } catch {
      return [];
    }
  }

  return {
    async append(entry) {
      const clean = sanitize(entry);
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, `${clean.time.slice(0, 10)}.jsonl`), `${JSON.stringify(clean)}\n`, "utf-8");
    },

    async recent(limit) {
      const out: ActivityEntry[] = [];
      for (const name of (await dayFiles()).reverse()) {
        const lines = (await readFile(join(dir, name), "utf-8")).split("\n").filter(Boolean).reverse();
        for (const line of lines) {
          try {
            out.push(JSON.parse(line) as ActivityEntry);
          } catch {
            // A torn line is skipped.
          }
          if (out.length >= limit) return out;
        }
      }
      return out;
    },

    async prune() {
      const cutoff = now().getTime() - RETENTION_DAYS * 86_400_000;
      for (const name of await dayFiles()) {
        const day = Date.parse(`${DAY_FILE.exec(name)![1]}T00:00:00Z`);
        if (day < cutoff) await rm(join(dir, name), { force: true });
      }
    },
  };
}
