import { Textarea } from "../../../shared/ui";

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

export function QueryEditor({ value, onChange, onExecute }: QueryEditorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Textarea
        aria-label="FetchXML"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onExecute();
          }
        }}
        className="min-h-24 flex-1 resize-none bg-surface p-3 font-mono text-xs leading-5 text-fg-strong"
      />
    </div>
  );
}
