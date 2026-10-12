import type { ReactNode } from "react";
import { Alert, Button, Checkbox, Field, Input, Textarea } from "../../../shared/ui";
import type { SettingsErrors, TableExpansion } from "../model/settings";
import type { BooleanSetting, FormSettings } from "../model/types";
import { plural } from "../model/results";

interface SettingsPanelProps {
  settings: FormSettings;
  errors: SettingsErrors;
  onChange: <Key extends keyof FormSettings>(key: Key, value: FormSettings[Key]) => void;
  disabled: boolean;
  tables: TableExpansion;
  tablesLoading: boolean;
  tablesError: string | null;
  onRetryTables: () => void;
  settingsFileError: string | null;
}

const OPTIONS: Array<{ key: BooleanSetting; label: string }> = [
  { key: "emitFieldsClasses", label: "Attribute and relationship name constants" },
  { key: "suppressINotifyPattern", label: "Turn off INotifyPropertyChanged" },
  { key: "emitVirtualAttributes", label: "Virtual attributes" },
  { key: "emitEntityETC", label: "Entity type codes" },
  { key: "suppressGeneratedCodeAttribute", label: "Turn off the GeneratedCode attribute" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-0">
      <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      {children}
    </section>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  disabled,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg">
        <Checkbox id={id} checked={checked} disabled={disabled} onChange={onChange} />
        {label}
      </label>
      {hint ? <p className="pl-6 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function tablesHint(tables: TableExpansion, loading: boolean): string {
  const base = "Use * or % as a wildcard. Leave empty to generate every table.";
  if (!tables.hasPatterns) return base;
  if (loading) return `${base} Loading the environment's tables to expand wildcards...`;
  return `${base} Matches ${plural(tables.names.length, "table")}. Wildcards are saved as the table names they match today.`;
}

/** Left panel: the ModelBuilder options, top to bottom. */
export function SettingsPanel({
  settings,
  errors,
  onChange,
  disabled,
  tables,
  tablesLoading,
  tablesError,
  onRetryTables,
  settingsFileError,
}: SettingsPanelProps) {
  const tablesEmpty = settings.tablesText.trim().length === 0;
  const messagesEmpty = settings.messagesText.trim().length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface">
      {settingsFileError ? (
        <div className="px-4 pt-4">
          <Alert tone="danger">
            {`builderSettings.json could not be read: ${settingsFileError}. The form keeps its current values, and the file is replaced on the next successful run.`}
          </Alert>
        </div>
      ) : null}

      <Section title="Code">
        <Field label="Namespace" error={errors.namespace}>
          <Input
            value={settings.namespace}
            disabled={disabled}
            className="font-mono"
            onChange={(event) => onChange("namespace", event.target.value)}
          />
        </Field>
        <Field
          label="Service context name"
          hint="Leave empty to skip the LINQ service context."
          error={errors.serviceContextName}
        >
          <Input
            value={settings.serviceContextName}
            disabled={disabled}
            className="font-mono"
            onChange={(event) => onChange("serviceContextName", event.target.value)}
          />
        </Field>
      </Section>

      <Section title="Folders">
        <p className="text-xs text-fg-muted">Subfolders of the output folder.</p>
        <Field label="Tables folder" error={errors.entityTypesFolder}>
          <Input
            value={settings.entityTypesFolder}
            disabled={disabled}
            className="font-mono"
            onChange={(event) => onChange("entityTypesFolder", event.target.value)}
          />
        </Field>
        <Field label="Choices folder" error={errors.optionSetsTypesFolder}>
          <Input
            value={settings.optionSetsTypesFolder}
            disabled={disabled}
            className="font-mono"
            onChange={(event) => onChange("optionSetsTypesFolder", event.target.value)}
          />
        </Field>
        <Field label="Messages folder" error={errors.messagesTypesFolder}>
          <Input
            value={settings.messagesTypesFolder}
            disabled={disabled}
            className="font-mono"
            onChange={(event) => onChange("messagesTypesFolder", event.target.value)}
          />
        </Field>
      </Section>

      <Section title="Tables">
        <Field
          label="Tables to generate"
          hint={tablesHint(tables, tablesLoading)}
          error={errors.tables}
        >
          <Textarea
            rows={5}
            value={settings.tablesText}
            disabled={disabled}
            spellCheck={false}
            className="font-mono"
            onChange={(event) => onChange("tablesText", event.target.value)}
          />
        </Field>
        {tablesEmpty ? (
          <Alert tone="warn">
            Every table in the environment will be generated. This can take several minutes and produce hundreds of
            files.
          </Alert>
        ) : null}
        {tablesError && !tablesEmpty ? (
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={onRetryTables}>
                Retry
              </Button>
            }
          >
            {`The environment's tables could not be loaded: ${tablesError}`}
          </Alert>
        ) : null}
      </Section>

      <Section title="Choices">
        <CheckboxRow
          id="ebg-global-choices"
          label="Generate global choices"
          checked={settings.generateGlobalOptionSets}
          disabled={disabled}
          onChange={(checked) => onChange("generateGlobalOptionSets", checked)}
          hint="Local choices, and global choices a generated table uses, are always generated."
        />
      </Section>

      <Section title="Messages">
        <CheckboxRow
          id="ebg-generate-messages"
          label="Generate message classes"
          checked={settings.generateMessages}
          disabled={disabled}
          onChange={(checked) => onChange("generateMessages", checked)}
          hint="Request and response classes for custom APIs, actions, and other messages."
        />
        <Field
          label="Messages to generate"
          hint="Use * or % as a wildcard. Messages already in the SDK assemblies are skipped."
          error={errors.messages}
        >
          <Textarea
            rows={5}
            value={settings.messagesText}
            disabled={disabled || !settings.generateMessages}
            spellCheck={false}
            className="font-mono"
            onChange={(event) => onChange("messagesText", event.target.value)}
          />
        </Field>
        {settings.generateMessages && messagesEmpty ? (
          <Alert tone="warn">
            Every message in the environment will be generated. This can take several minutes and produce thousands of
            files.
          </Alert>
        ) : null}
      </Section>

      <Section title="Options">
        {OPTIONS.map((option) => (
          <CheckboxRow
            key={option.key}
            id={`ebg-${option.key}`}
            label={option.label}
            checked={settings[option.key]}
            disabled={disabled}
            onChange={(checked) => onChange(option.key, checked)}
          />
        ))}
      </Section>
    </div>
  );
}
