import { useState } from "react";
import { Button } from "../../../shared/ui";
import { formatFetchXml } from "../model/fetchxmlFormat";

interface FetchXmlViewProps {
  fetchXml: string;
}

export function FetchXmlView({ fetchXml }: FetchXmlViewProps) {
  const [copied, setCopied] = useState(false);

  const pretty = formatFetchXml(fetchXml);

  const handleCopy = async () => {
    if (!fetchXml) return;
    await navigator.clipboard.writeText(pretty);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={handleCopy}
          disabled={!fetchXml}
          className="text-xs py-1 px-3"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </Button>
      </div>

      {fetchXml ? (
        <pre className="text-xs text-fg bg-canvas border border-line rounded-sm p-4 overflow-auto whitespace-pre-wrap break-all flex-1 min-h-0 font-mono">
          {pretty}
        </pre>
      ) : (
        <div className="flex items-center justify-center flex-1 text-fg-muted text-sm border border-dashed border-line rounded-sm">
          Run a query to see the generated FetchXML.
        </div>
      )}
    </div>
  );
}
