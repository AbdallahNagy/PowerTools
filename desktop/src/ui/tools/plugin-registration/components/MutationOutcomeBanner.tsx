import { Button } from "../../../shared/ui";
import type { MutationOutcome } from "../model/pluginRegistrationError";

export function MutationOutcomeBanner({ outcome, retryRead, refreshPending = false }: {
  outcome: MutationOutcome | null;
  retryRead?: (() => void) | null;
  refreshPending?: boolean;
}) {
  if (!outcome) return null;

  if (outcome.outcome === "succeededAndVerified") {
    return <div role="status" className="border border-green-700 bg-green-950/40 px-3 py-2 text-sm text-green-200">
      The registration change succeeded and was verified.
    </div>;
  }

  if (outcome.outcome === "reconciledAfterCommunicationFailure") {
    return <div role="status" className="border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
      The registration change was verified after a communication failure.
    </div>;
  }

  const uncertain = outcome.outcome === "outcomeUncertain";
  const message = uncertain
    ? "The mutation outcome is uncertain. Refresh and inspect before trying again."
    : outcome.problem?.message ?? "The registration change was rejected before completion.";
  const suggestedAction = uncertain
    ? "Do not repeat this mutation until the complete catalog refresh finishes."
    : outcome.problem?.suggestedAction;

  return <div role="alert" className="flex items-center justify-between gap-3 border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
    <div><p>{message}</p>{suggestedAction ? <p className="text-xs text-red-300">{suggestedAction}</p> : null}</div>
    {retryRead && !uncertain ? <Button type="button" variant="secondary" onClick={retryRead} disabled={refreshPending}>Try again</Button> : null}
  </div>;
}
