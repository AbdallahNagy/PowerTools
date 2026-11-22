import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActivityLog, type ActivityEntry } from "../../../src/electron/mcp/activityLog";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pt-activity-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entry(time: string, over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    time,
    client: "claude-code",
    tool: "inspect_schema",
    connection: "A · Dev",
    effect: "read",
    approval: "not-needed",
    outcome: "ok",
    summary: "inspect_schema",
    ...over,
  };
}

describe("activity log", () => {
  it("returns entries newest first across day files", async () => {
    const log = createActivityLog(dir);
    await log.append(entry("2026-11-10T10:00:00.000Z", { summary: "a" }));
    await log.append(entry("2026-11-11T09:00:00.000Z", { summary: "b" }));
    await log.append(entry("2026-11-11T10:00:00.000Z", { summary: "c" }));
    expect((await log.recent(10)).map((e) => e.summary)).toEqual(["c", "b", "a"]);
    expect((await log.recent(2)).map((e) => e.summary)).toEqual(["c", "b"]);
    expect((await readdir(dir)).sort()).toEqual(["2026-11-10.jsonl", "2026-11-11.jsonl"]);
  });

  it("prunes files older than 30 days", async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
    const log = createActivityLog(dir, () => new Date(Date.UTC(2026, 0, 40)));
    await log.append(entry(day(1)));
    await log.append(entry(day(20)));
    await log.prune();
    expect(await readdir(dir)).toEqual(["2026-01-20.jsonl"]);
  });

  it("never writes a token and drops unknown fields", async () => {
    const log = createActivityLog(dir);
    await log.append({ ...entry("2026-11-11T10:00:00.000Z"), token: "secret-value" } as ActivityEntry);
    const text = await readFile(join(dir, "2026-11-11.jsonl"), "utf-8");
    expect(text).not.toContain("token");
    expect(text).not.toContain("secret-value");
  });

  it("keeps an approved plan's hash and at most 50 steps, with only op, target and effect", async () => {
    const log = createActivityLog(dir);
    const steps = Array.from({ length: 60 }, (_, i) => ({ op: "createColumn", target: `c${i}`, effect: "change", secret: "s" }));
    await log.append(entry("2026-11-11T10:00:00.000Z", { planHash: "abc", steps }));
    const saved = (await log.recent(1))[0];
    expect(saved.planHash).toBe("abc");
    expect(saved.steps).toHaveLength(50);
    expect(saved.steps![0]).toEqual({ op: "createColumn", target: "c0", effect: "change" });
  });

  it("truncates the summary to 200 characters", async () => {
    const log = createActivityLog(dir);
    await log.append(entry("2026-11-11T10:00:00.000Z", { summary: "x".repeat(500) }));
    expect((await log.recent(1))[0].summary).toHaveLength(200);
  });

  it("reads an empty folder as no entries", async () => {
    expect(await createActivityLog(join(dir, "missing")).recent(5)).toEqual([]);
  });
});
