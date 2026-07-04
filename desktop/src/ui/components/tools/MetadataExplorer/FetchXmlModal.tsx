import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";

interface FetchXmlModalProps {
  open: boolean;
  fetchXml: string;
  onClose: () => void;
}

export function FetchXmlModal({ open, fetchXml, onClose }: FetchXmlModalProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(fetchXml);
  };

  const pretty = prettify(fetchXml);

  return (
    <Modal open={open} title="FetchXML" onClose={onClose} widthClass="max-w-3xl">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={handleCopy} className="text-xs py-1 px-3">
          Copy to clipboard
        </Button>
      </div>
      <pre className="text-xs text-[#cccccc] bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-4 overflow-auto whitespace-pre-wrap break-all flex-1 min-h-0 font-mono">
        {pretty}
      </pre>
    </Modal>
  );
}

function prettify(xml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    // Basic indent via regex
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
