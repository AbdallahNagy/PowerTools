import { useId, type ReactNode } from "react";

import { Switch } from "../../../shared/ui";

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
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-fg-strong">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-xs text-fg-muted">
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {aside}
        <Switch
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          aria-label={label}
          aria-describedby={description ? descriptionId : undefined}
        />
      </div>
    </div>
  );
}
