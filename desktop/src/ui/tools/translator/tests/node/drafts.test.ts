import { describe, expect, it } from "vitest";
import {
  BASE_REQUIRED_MESSAGE,
  CLEAR_NOT_SUPPORTED_MESSAGE,
  NO_DRAFTS,
  applyJobResults,
  draftProblem,
  invalidCount,
  patchRows,
  setDraft,
  summarizeByScope,
  toApplyRows,
} from "../../model/drafts";
import { accountColumnRows, accountTableRows, completedJob, globalRows } from "../fixtures";

const displayName = accountTableRows[0]!;
const pluralName = accountTableRows[1]!;

describe("translator drafts", () => {
  it("keeps only changed cells and drops a draft restored to the original", () => {
    let drafts = setDraft(NO_DRAFTS, displayName, 1036, "Compte client");
    expect(drafts.size).toBe(1);
    const draft = [...drafts.values()][0]!;
    expect(draft).toMatchObject({ original: "Compte", scope: "account", tab: "table", labelName: "Display Name" });

    drafts = setDraft(drafts, displayName, 1036, "Compte");
    expect(drafts.size).toBe(0);
  });

  it("requires base names and does not offer clearing a translation", () => {
    const base = setDraft(NO_DRAFTS, displayName, 1033, " ");
    const translation = setDraft(NO_DRAFTS, displayName, 1036, "");
    expect(draftProblem([...base.values()][0]!, 1033)).toBe(BASE_REQUIRED_MESSAGE);
    expect(draftProblem([...translation.values()][0]!, 1033)).toBe(CLEAR_NOT_SUPPORTED_MESSAGE);
    expect(invalidCount(base, 1033)).toBe(1);
    expect(draftProblem({ value: "Ok", lcid: 1033, key: displayName.key }, 1033)).toBeNull();
  });

  it("groups cells into one apply row per key and summarizes by scope", () => {
    let drafts = setDraft(NO_DRAFTS, displayName, 1036, "Compte client");
    drafts = setDraft(drafts, displayName, 1031, "Konto");
    drafts = setDraft(drafts, pluralName, 1036, "Comptes");
    drafts = setDraft(drafts, globalRows[1]!, 1036, "Rouge");

    expect(toApplyRows(drafts)).toEqual([
      { key: displayName.key, labels: { 1036: "Compte client", 1031: "Konto" } },
      { key: pluralName.key, labels: { 1036: "Comptes" } },
      { key: globalRows[1]!.key, labels: { 1036: "Rouge" } },
    ]);
    expect(summarizeByScope(drafts)).toEqual([
      { scope: "account", title: "account", count: 3 },
      { scope: "#global", title: "Global choices", count: 1 },
    ]);
  });

  it("clears applied drafts, keeps failed ones with their error, and patches loaded rows", () => {
    let drafts = setDraft(NO_DRAFTS, displayName, 1036, "Compte client");
    drafts = setDraft(drafts, accountColumnRows[0]!, 1036, "Nom");
    drafts = setDraft(drafts, accountColumnRows[1]!, 1031, "Beschreibung");
    const sent = [...drafts.values()];

    const outcome = applyJobResults(
      drafts,
      sent,
      completedJob({
        results: [
          { key: displayName.key, lcids: [1036], outcome: "succeeded", message: null },
          { key: accountColumnRows[0]!.key, lcids: [1036], outcome: "failed", message: "Denied." },
          { key: accountColumnRows[1]!.key, lcids: [1031], outcome: "skipped", message: "This column no longer exists." },
        ],
      }),
    );

    expect(outcome.succeeded.map((draft) => draft.labelName)).toEqual(["Display Name"]);
    expect([...outcome.drafts.values()].map((draft) => draft.error)).toEqual([
      "Denied.",
      "Skipped: This column no longer exists.",
    ]);
    expect(patchRows(accountTableRows, outcome.succeeded)[0]!.labels["1036"]).toBe("Compte client");
  });

  it("reports cells the job has no result for with the job's last error", () => {
    const drafts = setDraft(NO_DRAFTS, displayName, 1036, "Compte client");
    const outcome = applyJobResults(
      drafts,
      [...drafts.values()],
      completedJob({ status: "failed", log: [{ level: "error", message: "Connection lost." }] }),
    );
    expect(outcome.failed[0]!.error).toBe("Connection lost.");
  });
});
