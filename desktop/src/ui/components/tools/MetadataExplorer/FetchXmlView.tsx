import { useState } from "react";
import { Button } from "../../ui/Button";

interface FetchXmlViewProps {
  fetchXml: string;
}

export function FetchXmlView({ fetchXml }: FetchXmlViewProps) {
  const [copied, setCopied] = useState(false);

  const pretty = prettify(fetchXml);

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
        <pre className="text-xs text-[#cccccc] bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-4 overflow-auto whitespace-pre-wrap break-all flex-1 min-h-0 font-mono">
          {pretty}
        </pre>
      ) : (
        <div className="flex items-center justify-center flex-1 text-[#555] text-sm border border-dashed border-[#3c3c3c] rounded-sm">
          Run a query to see the generated FetchXML.
        </div>
      )}
    </div>
  );
}

function prettify(xml: string): string {
  if (!xml) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    return raw
      .replace(/></g, ">\n<")
      .split("\n")
      .reduce<{ out: string[]; depth: number }>(
        (acc, line) => {
          const isClose = /^<\//.test(line.trim());
          const isSelf = /\/>$/.test(line.trim());
          if (isClose && acc.depth > 0) acc.depth--;
          acc.out.push("  ".repeat(acc.depth) + line.trim());
          if (!isClose && !isSelf && /<[^/]/.test(line.trim())) acc.depth++;
          return acc;
        },
        { out: [], depth: 0 }
      ).out.join("\n");
  } catch {
    return xml;
  }
}
