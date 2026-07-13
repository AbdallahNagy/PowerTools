import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { formatFetchXml } from "./model/fetchxmlFormat";

interface FetchXmlModalProps {
  open: boolean;
  fetchXml: string;
  onClose: () => void;
}

export function FetchXmlModal({ open, fetchXml, onClose }: FetchXmlModalProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(fetchXml);
  };

  const pretty = formatFetchXml(fetchXml);

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
