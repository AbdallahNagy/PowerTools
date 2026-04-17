import { useState } from "react";
import { Button } from "../../../ui/Button";

interface FilterStepProps {
  entityLogicalName: string;
  selectedAttributes: string[];
  initialFilter: string;
  onNext: (filter: string) => void;
  onBack: () => void;
}

export function FilterStep({
  entityLogicalName,
  selectedAttributes,
  initialFilter,
  onNext,
  onBack,
}: FilterStepProps) {
  const [filter, setFilter] = useState(initialFilter);
  const [xmlError, setXmlError] = useState<string | null>(null);

  const validate = (value: string): boolean => {
    if (!value.trim()) return true;
    const wrapped = `<root>${value}</root>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(wrapped, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) {
      setXmlError(err.textContent ?? "Invalid XML");
      return false;
    }
    setXmlError(null);
    return true;
  };

  const handleChange = (val: string) => {
    setFilter(val);
    if (xmlError) validate(val);
  };

  const handleNext = () => {
    if (validate(filter)) onNext(filter);
  };

  const composed = buildFetchXmlPreview(entityLogicalName, selectedAttributes, filter);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-[#858585] uppercase tracking-wider block mb-1.5">
          FetchXML Filter <span className="normal-case text-[#555]">(optional)</span>
        </label>
        <textarea
          value={filter}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`<filter>\n  <condition attribute="statecode" operator="eq" value="0" />\n</filter>`}
          spellCheck={false}
          className="w-full h-28 font-mono text-xs bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc]
                     rounded-sm p-3 resize-none focus:outline-none focus:border-[#007fd4]
                     placeholder-[#555]"
        />
        {xmlError && (
          <p className="text-xs text-[#f48771] mt-1">{xmlError}</p>
        )}
        <p className="text-xs text-[#858585] mt-1">
          Enter only the <code className="text-[#cccccc]">&lt;filter&gt;</code> element. Leave blank to migrate all records.
        </p>
      </div>

      <div>
        <p className="text-xs text-[#858585] uppercase tracking-wider mb-1.5">Composed FetchXML</p>
        <pre className="text-xs font-mono bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-3 overflow-auto max-h-48 text-[#858585] whitespace-pre-wrap">
          {composed}
        </pre>
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm text-[#858585] hover:text-white transition-colors">
          ← Back
        </button>
        <Button onClick={handleNext}>Next →</Button>
      </div>
    </div>
  );
}

function buildFetchXmlPreview(entity: string, attrs: string[], filter: string): string {
  const attrLines = attrs.map((a) => `  <attribute name="${a}" />`).join("\n");
  const filterBlock = filter.trim() ? `\n  ${filter.trim()}` : "";
  return `<fetch>\n  <entity name="${entity}">\n${attrLines}${filterBlock}\n  </entity>\n</fetch>`;
}
