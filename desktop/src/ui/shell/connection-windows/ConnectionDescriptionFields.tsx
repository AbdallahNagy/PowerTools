import { useId } from "react";

import {
  ENVIRONMENT_PRESETS,
  connectionDisplayName,
  knownOrganizations,
  nextFreeEnvironment,
  suggestOrganization,
  type BrowserId,
  type ConnectionSummary,
  type InstalledBrowser,
} from "../../shared/connections";
import { Field, Input, Select, cn } from "../../shared/ui";
import { validateDraft, type DescriptionDraft } from "./connectionDraft";

interface ConnectionDescriptionFieldsProps {
  draft: DescriptionDraft;
  onChange: (draft: DescriptionDraft) => void;
  connections: readonly ConnectionSummary[];
  browsers: readonly InstalledBrowser[];
  envUrl: string;
  /** The connection being edited, left out of the clash check. */
  exceptId?: string;
  /** Show errors for empty fields, after the user tried to save. */
  showRequired?: boolean;
  autoFocus?: boolean;
}

/** Organization, environment and browser fields shared by the add and edit forms. */
export function ConnectionDescriptionFields({
  draft,
  onChange,
  connections,
  browsers,
  envUrl,
  exceptId,
  showRequired = false,
  autoFocus = false,
}: ConnectionDescriptionFieldsProps) {
  const organizationsId = useId();
  const errors = validateDraft(draft, connections, exceptId);
  const organizations = knownOrganizations(connections as ConnectionSummary[]);
  const urlSuggestion = suggestOrganization(envUrl);
  const set = (patch: Partial<DescriptionDraft>) => onChange({ ...draft, ...patch });

  const selectedBrowser = browsers.find((browser) => browser.id === draft.browser?.id) ?? null;
  const preview = draft.organization.trim() && draft.environment.trim()
    ? connectionDisplayName({
        organization: draft.organization.trim(),
        environment: draft.environment.trim(),
        legacyName: null,
        envUrl,
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Organization"
        error={showRequired || draft.organization ? errors.organization : undefined}
        hint={
          urlSuggestion && !draft.organization ? (
            <button
              type="button"
              className="text-accent-text hover:underline"
              onClick={() => set({ organization: urlSuggestion })}
            >
              Use “{urlSuggestion}” from the address
            </button>
          ) : (
            "Connections are grouped by organization."
          )
        }
      >
        <Input
          type="text"
          value={draft.organization}
          list={organizationsId}
          autoFocus={autoFocus}
          placeholder="Contoso"
          className="bg-raised"
          onChange={(event) => set({ organization: event.target.value })}
        />
      </Field>
      <datalist id={organizationsId}>
        {organizations.map((organization) => (
          <option key={organization} value={organization} />
        ))}
      </datalist>

      <Field
        label="Environment"
        error={showRequired || draft.environment ? errors.environment : undefined}
      >
        <Input
          type="text"
          value={draft.environment}
          placeholder="Dev, Test, Production…"
          className="bg-raised"
          onChange={(event) => set({ environment: event.target.value })}
        />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Common environments">
        {ENVIRONMENT_PRESETS.map((preset) => {
          const value = nextFreeEnvironment(connections, draft.organization, preset, exceptId);
          const selected = draft.environment.trim().toLowerCase() === value.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-sm border px-2 py-0.5 text-xs transition-colors",
                selected
                  ? "border-transparent bg-accent-soft text-accent-text"
                  : "border-line bg-raised text-fg hover:bg-hover",
              )}
              onClick={() => set({ environment: value })}
            >
              {value}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Field label="Open links in" className="flex-1">
          <Select
            value={draft.browser?.id ?? ""}
            onChange={(event) => {
              const id = event.target.value as BrowserId | "";
              if (!id) {
                set({ browser: null });
                return;
              }
              const browser = browsers.find((candidate) => candidate.id === id);
              set({ browser: { id, ...(browser?.profiles[0] ? { profile: browser.profiles[0].id } : {}) } });
            }}
          >
            <option value="">System default browser</option>
            {browsers.map((browser) => (
              <option key={browser.id} value={browser.id}>
                {browser.name}
              </option>
            ))}
            {draft.browser && !selectedBrowser ? (
              <option value={draft.browser.id}>{draft.browser.id} (not found)</option>
            ) : null}
          </Select>
        </Field>
        {selectedBrowser && selectedBrowser.profiles.length > 1 ? (
          <Field label="Profile" className="flex-1">
            <Select
              value={draft.browser?.profile ?? ""}
              onChange={(event) =>
                set({ browser: { id: selectedBrowser.id, profile: event.target.value } })
              }
            >
              {selectedBrowser.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {preview ? (
        <p className="text-xs text-fg-muted">
          Shows as <span className="text-fg-strong">{preview}</span>
        </p>
      ) : null}
    </div>
  );
}
