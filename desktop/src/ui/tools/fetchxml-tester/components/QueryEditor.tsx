interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

export function QueryEditor({ value, onChange, onExecute }: QueryEditorProps) {
  return (
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
      className="h-48 w-full resize-y rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-darker)] p-3 font-mono text-xs leading-5 text-[var(--color-text-white)] focus:border-[var(--color-primary)] focus:outline-none"
    />
  );
}
