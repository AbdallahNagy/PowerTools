import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  entityLogicalName: string;
  selectedAttributes: string[];
  value: string;
  onApply: (filter: string) => void;
}

export function FilterModal({
  open,
  onClose,
  entityLogicalName,
  selectedAttributes,
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

  const composed = buildFetchXmlPreview(
    entityLogicalName,
    selectedAttributes,
    draft
  );

  return (
    <Modal open={open} onClose={onClose} title="FetchXML Filter">
      <div>
        <label className="text-xs text-[#858585] uppercase tracking-wider block mb-1.5">
          Filter <span className="normal-case text-[#555]">(optional)</span>
        </label>
        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`<filter>\n  <condition attribute="statecode" operator="eq" value="0" />\n</filter>`}
          spellCheck={false}
          className="w-full h-32 font-mono text-xs bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc]
                     rounded-sm p-3 resize-none focus:outline-none focus:border-[#007fd4]
                     placeholder-[#555]"
        />
        {xmlError && <p className="text-xs text-[#f48771] mt-1">{xmlError}</p>}
        <p className="text-xs text-[#858585] mt-1">
          Enter only the{" "}
          <code className="text-[#cccccc]">&lt;filter&gt;</code> element. Leave
          blank to migrate all records.
        </p>
      </div>

      <div>
        <p className="text-xs text-[#858585] uppercase tracking-wider mb-1.5">
          Composed FetchXML
        </p>
        <pre className="text-xs font-mono bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-3 overflow-auto max-h-40 text-[#858585] whitespace-pre-wrap">
          {composed}
        </pre>
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

function buildFetchXmlPreview(
  entity: string,
  attrs: string[],
  filter: string
): string {
  const attrLines = attrs.map((a) => `  <attribute name="${a}" />`).join("\n");
  const filterBlock = filter.trim() ? `\n  ${filter.trim()}` : "";
  return `<fetch>\n  <entity name="${entity}">\n${attrLines}${filterBlock}\n  </entity>\n</fetch>`;
}
