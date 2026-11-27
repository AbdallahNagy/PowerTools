import { useEffect, useState } from "react";
import { Button, CodeEditor, Field, Modal } from "../../../shared/ui";

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onApply: (filter: string) => void;
}

export function FilterModal({
  open,
  onClose,
  value,
  onApply,
}: FilterModalProps) {
  const [draft, setDraft] = useState(value);
  const [xmlError, setXmlError] = useState<string | null>(null);

  // Re-sync the draft each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setXmlError(null);
    }
  }, [open, value]);

  const validate = (val: string): boolean => {
    if (!val.trim()) {
      setXmlError(null);
      return true;
    }
    const doc = new DOMParser().parseFromString(
      `<root>${val}</root>`,
      "application/xml"
    );
    const err = doc.querySelector("parsererror");
    if (err) {
      setXmlError(err.textContent ?? "Invalid XML");
      return false;
    }
    setXmlError(null);
    return true;
  };

  const handleChange = (val: string) => {
    setDraft(val);
    if (xmlError) validate(val);
  };

  const handleApply = () => {
    if (validate(draft)) onApply(draft);
  };

  return (
    <Modal open={open} onClose={onClose} title="FetchXML Filter">
      <div>
        <Field
          label={
            <>
              Filter <span className="font-normal">(optional)</span>
            </>
          }
          error={xmlError || undefined}
        >
          <CodeEditor
            aria-label="Filter"
            value={draft}
            onChange={handleChange}
            placeholder={`<filter>\n  <condition attribute="statecode" operator="eq" value="0" />\n</filter>`}
            className="h-80"
          />
        </Field>
        <p className="text-xs text-fg-muted mt-1">
          Enter the{" "}
          <code className="text-fg">&lt;filter&gt;</code> and{" "}
          <code className="text-fg">&lt;link-entity&gt;</code> elements, or
          paste full FetchXML. Leave blank to migrate all records.
        </p>
      </div>

      <div className="flex justify-between pt-1">
        <Button variant="secondary" onClick={() => onApply("")}>
          Clear filter
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </div>
      </div>
    </Modal>
  );
}
