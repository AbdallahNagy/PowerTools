import { SHELL_SHORTCUT_LIST } from "../../keyboard/shellShortcuts";

export function ShortcutsSection() {
  return (
    <table className="w-full border border-line text-sm">
      <thead>
        <tr className="border-b border-line bg-raised text-left text-xs text-fg-muted">
          <th className="px-3 py-1.5 font-medium">Action</th>
          <th className="px-3 py-1.5 font-medium">Keys</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {SHELL_SHORTCUT_LIST.map((entry) => (
          <tr key={entry.id}>
            <td className="px-3 py-1.5 text-fg">{entry.label}</td>
            <td className="px-3 py-1.5">
              <span className="flex flex-wrap gap-1">
                {entry.keys.map((key) => (
                  <kbd key={key} className="rounded-sm border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs text-fg-strong">
                    {key}
                  </kbd>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
