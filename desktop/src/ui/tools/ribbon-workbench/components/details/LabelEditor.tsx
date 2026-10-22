import { Plus, X } from "lucide-react";
import { Button, Field, Input } from "../../../../shared/ui";
import { attr, child, el, elements, withAttr } from "../../model/node";
import type { RibbonNode } from "../../model/types";
import { IconButton } from "./EditorParts";

interface LabelEditorProps {
  label: RibbonNode;
  readOnly: boolean;
  usedBy: number;
  onChange: (label: RibbonNode) => void;
  onDelete: () => void;
}

export function LabelEditor({ label, readOnly, usedBy, onChange, onDelete }: LabelEditorProps) {
  const titles = elements(child(label, "Titles"));
  const setTitles = (list: RibbonNode[]) => {
    const others = label.children.filter((item) => item.name !== "Titles");
    onChange({ ...label, children: [el("Titles", {}, list), ...others] });
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg-strong">Label</h3>
      <Field label="Id">
        <Input className="font-mono" value={attr(label, "Id") ?? ""} disabled={readOnly} onChange={(event) => onChange(withAttr(label, "Id", event.target.value))} />
      </Field>
      <section aria-label="Languages" className="flex flex-col gap-2">
        {titles.map((title, index) => (
          <div key={index} className="flex items-end gap-2">
            <Field label="Language" className="w-24 shrink-0">
              <Input
                type="number"
                aria-label={`Language ${index + 1}`}
                value={attr(title, "languagecode") ?? ""}
                disabled={readOnly}
                onChange={(event) => setTitles(titles.map((item, i) => (i === index ? withAttr(item, "languagecode", event.target.value) : item)))}
              />
            </Field>
            <Field label="Text" className="min-w-0 flex-1">
              <Input
                aria-label={`Text ${index + 1}`}
                value={attr(title, "description") ?? ""}
                disabled={readOnly}
                onChange={(event) => setTitles(titles.map((item, i) => (i === index ? { ...item, attributes: { ...item.attributes, description: event.target.value } } : item)))}
              />
            </Field>
            <IconButton label={`Remove language ${index + 1}`} disabled={readOnly || titles.length === 1} onClick={() => setTitles(titles.filter((_, i) => i !== index))}>
              <X size={14} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            onClick={() => setTitles([...titles, el("Title", { languagecode: "", description: "" })])}
          >
            <Plus size={14} aria-hidden="true" /> Add language
          </Button>
        </div>
      </section>
      <div className="border-t border-line pt-3">
        <Button variant="danger" size="sm" disabled={readOnly || usedBy > 0} onClick={onDelete}>
          Delete
        </Button>
        {usedBy > 0 ? <p className="mt-1 text-xs text-fg-muted">{`Used by ${usedBy} item${usedBy === 1 ? "" : "s"}`}</p> : null}
      </div>
    </div>
  );
}
