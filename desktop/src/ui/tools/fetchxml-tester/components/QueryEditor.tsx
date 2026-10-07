import { CodeEditor } from "../../../shared/ui";

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

export function QueryEditor({ value, onChange, onExecute }: QueryEditorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CodeEditor
        aria-label="FetchXML"
        value={value}
        onChange={onChange}
        onSubmit={onExecute}
        className="min-h-24 flex-1"
      />
    </div>
  );
}
