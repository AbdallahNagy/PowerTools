import { useId, type ReactNode } from "react";

import { Switch, cn } from "../../../shared/ui";

interface SettingsGroupProps {
  /** Names the group. Shown as its heading unless `hideTitle` is set. */
  title: string;
  hideTitle?: boolean;
  description?: ReactNode;
  /** Sits to the right of the heading, such as a Refresh button. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Related settings under one heading, drawn as rows of one card. */
export function SettingsGroup({ title, hideTitle, description, action, children, className }: SettingsGroupProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      {hideTitle && !description && !action ? null : (
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            {hideTitle ? null : <h4 className="text-sm font-semibold text-fg-strong">{title}</h4>}
            {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn("flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface", className)}>
        {children}
      </div>
    </section>
  );
}

interface SettingRowProps {
  label: ReactNode;
  description?: ReactNode;
  /** The control, on the right. */
  children?: ReactNode;
}

/** One setting: what it is on the left, its control on the right. */
export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-fg-strong">{label}</span>
        {description ? <span className="text-xs text-fg-muted">{description}</span> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
    </div>
  );
}

interface SettingSwitchRowProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  /** Shown before the switch, such as a status badge. */
  aside?: ReactNode;
}

/** One on/off setting: what it is on the left, the switch on the right. */
export function SettingSwitchRow({ label, description, checked, disabled, onChange, aside }: SettingSwitchRowProps) {
  const descriptionId = useId();
  return (
    <SettingRow label={label} description={description ? <span id={descriptionId}>{description}</span> : undefined}>
      {aside}
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
      />
    </SettingRow>
  );
}
