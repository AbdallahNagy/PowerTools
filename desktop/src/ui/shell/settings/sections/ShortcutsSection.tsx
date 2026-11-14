import { SHELL_SHORTCUT_LIST } from "../../keyboard/shellShortcuts";
import { SettingRow, SettingsGroup } from "./SettingRow";

export function ShortcutsSection() {
  return (
    <SettingsGroup title="Shortcuts" hideTitle>
      {SHELL_SHORTCUT_LIST.map((entry) => (
        <SettingRow key={entry.id} label={entry.label}>
          {entry.keys.map((key) => (
            <kbd
              key={key}
              className="rounded-sm border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-xs text-fg-strong"
            >
              {key}
            </kbd>
          ))}
        </SettingRow>
      ))}
    </SettingsGroup>
  );
}
