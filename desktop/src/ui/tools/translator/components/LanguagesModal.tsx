import { Button, Checkbox, Modal } from "../../../shared/ui";
import { languageHeader } from "../model/labels";
import type { Language } from "../model/types";

interface LanguagesModalProps {
  open: boolean;
  languages: readonly Language[];
  baseLcid: number;
  visible: ReadonlySet<number>;
  onToggle: (lcid: number, visible: boolean) => void;
  onAll: () => void;
  onBaseOnly: () => void;
  onClose: () => void;
}

export function LanguagesModal({
  open,
  languages,
  baseLcid,
  visible,
  onToggle,
  onAll,
  onBaseOnly,
  onClose,
}: LanguagesModalProps) {
  return (
    <Modal open={open} title="Languages" onClose={onClose} widthClass="max-w-md">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onAll}>
          All languages
        </Button>
        <Button variant="ghost" size="sm" onClick={onBaseOnly}>
          Base language only
        </Button>
      </div>
      <ul className="flex flex-col gap-2" aria-label="Languages">
        {languages.map((language) => {
          const isBase = language.lcid === baseLcid;
          const id = `translator-language-${language.lcid}`;
          return (
            <li key={language.lcid} className="flex flex-col gap-0.5">
              <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg">
                <Checkbox
                  id={id}
                  checked={isBase || visible.has(language.lcid)}
                  disabled={isBase}
                  onChange={(checked) => onToggle(language.lcid, checked)}
                />
                {languageHeader(language)}
              </label>
              {isBase ? <p className="pl-6 text-xs text-fg-muted">The base language is always shown.</p> : null}
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
