import { Modal, cn } from "../../shared/ui";
import { useSettings } from "./SettingsContext";
import { SETTINGS_SECTION_LABELS, SETTINGS_SECTIONS, type SettingsSection } from "./settingsSections";
import { AgentPermissionsSection } from "./sections/AgentPermissionsSection";
import { AgentsSection } from "./sections/AgentsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { PrivacySection } from "./sections/PrivacySection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { UpdatesAboutSection } from "./sections/UpdatesAboutSection";
import { useAppSettings } from "./useAppSettings";

function SectionBody({ section, active }: { section: SettingsSection; active: boolean }) {
  const app = useAppSettings(active);
  switch (section) {
    case "appearance":
      return <AppearanceSection app={app} />;
    case "agents":
      return <AgentsSection active={active} />;
    case "permissions":
      return <AgentPermissionsSection />;
    case "privacy":
      return <PrivacySection app={app} />;
    case "updates":
      return <UpdatesAboutSection app={app} />;
    case "shortcuts":
      return <ShortcutsSection />;
  }
}

export function SettingsDialog() {
  const { open, section, setSection, closeSettings } = useSettings();

  return (
    <Modal open={open} title="Settings" onClose={closeSettings} widthClass="max-w-5xl">
      <div className="flex h-[70vh] min-h-0 flex-col gap-4 sm:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 flex-row flex-wrap gap-1 sm:w-48 sm:flex-col">
          {SETTINGS_SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={id === section ? "page" : undefined}
              onClick={() => setSection(id)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-left text-sm",
                id === section ? "bg-accent-soft text-accent-text" : "text-fg hover:bg-hover hover:text-fg-strong",
              )}
            >
              {SETTINGS_SECTION_LABELS[id]}
            </button>
          ))}
        </nav>
        <section
          aria-label={SETTINGS_SECTION_LABELS[section]}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
        >
          <h3 className="text-base font-semibold text-fg-strong">{SETTINGS_SECTION_LABELS[section]}</h3>
          <SectionBody section={section} active={open} />
        </section>
      </div>
    </Modal>
  );
}
