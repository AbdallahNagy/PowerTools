import { useEffect, useRef, useState } from "react";
import { Bot, EyeOff, Info, Keyboard, Palette, ShieldCheck, type LucideIcon } from "lucide-react";

import { Modal, ModalTitle, SearchInput, cn } from "../../shared/ui";
import { useSettings } from "./SettingsContext";
import {
  matchSettingsSections,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTION_DESCRIPTIONS,
  SETTINGS_SECTION_LABELS,
  type SettingsSection,
} from "./settingsSections";
import { AgentPermissionsSection } from "./sections/AgentPermissionsSection";
import { AgentsSection } from "./sections/AgentsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { PrivacySection } from "./sections/PrivacySection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { UpdatesAboutSection } from "./sections/UpdatesAboutSection";
import { useAppSettings } from "./useAppSettings";

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  appearance: Palette,
  shortcuts: Keyboard,
  agents: Bot,
  permissions: ShieldCheck,
  privacy: EyeOff,
  updates: Info,
};

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
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const matches = matchSettingsSections(query);

  // Each section starts at its top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [section]);

  const search = (next: string) => {
    setQuery(next);
    const found = matchSettingsSections(next);
    if (found.length > 0 && !found.includes(section)) setSection(found[0]);
  };

  const close = () => {
    setQuery("");
    closeSettings();
  };

  return (
    <Modal open={open} title="Settings" onClose={close} frameless widthClass="max-w-5xl" panelClass="h-[44rem] rounded-md">
      <aside className="flex w-56 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3">
        <ModalTitle asChild>
          <h2 className="px-2 pt-1 text-base font-semibold text-fg-strong">Settings</h2>
        </ModalTitle>
        <SearchInput value={query} onChange={search} placeholder="Search settings" aria-label="Search settings" />
        <nav aria-label="Settings sections" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {SETTINGS_NAV_GROUPS.map((group) => {
            const sections = group.sections.filter((id) => matches.includes(id));
            if (sections.length === 0) return null;
            return (
              <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
                <span aria-hidden="true" className="px-2 pb-0.5 text-xs text-fg-muted">
                  {group.label}
                </span>
                {sections.map((id) => {
                  const Icon = SECTION_ICONS[id];
                  const current = id === section;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={current ? "page" : undefined}
                      onClick={() => setSection(id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                        current ? "bg-accent-soft text-fg-strong" : "text-fg hover:bg-hover hover:text-fg-strong",
                      )}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={cn("shrink-0", current ? "text-accent-text" : "text-fg-muted")}
                      />
                      {SETTINGS_SECTION_LABELS[id]}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {matches.length === 0 ? (
            <p className="px-2 text-xs text-fg-muted">No settings match “{query.trim()}”. Try another word.</p>
          ) : null}
        </nav>
      </aside>
      <section aria-label={SETTINGS_SECTION_LABELS[section]} className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="shrink-0 pb-4 pl-8 pr-14 pt-6">
          <h3 className="text-lg font-semibold text-fg-strong">{SETTINGS_SECTION_LABELS[section]}</h3>
          <p className="mt-0.5 text-sm text-fg-muted">{SETTINGS_SECTION_DESCRIPTIONS[section]}</p>
        </header>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          <div className="flex max-w-2xl flex-col gap-6">
            <SectionBody section={section} active={open} />
          </div>
        </div>
      </section>
    </Modal>
  );
}
