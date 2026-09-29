interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

export function QueryEditor({ value, onChange, onExecute }: QueryEditorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
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
        className="min-h-24 w-full flex-1 resize-none rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-darker)] p-3 font-mono text-xs leading-5 text-[var(--color-text-white)] focus:border-[var(--color-primary)] focus:outline-none"
      />
    </div>
  );
}
