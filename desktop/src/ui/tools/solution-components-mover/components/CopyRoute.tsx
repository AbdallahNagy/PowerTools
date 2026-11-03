import { ArrowRight, Package } from "lucide-react";
import { cn } from "../../../shared/ui";

/** Shows where a copy goes: source solutions, an arrow, then target solutions. */
export function CopyRoute({
  sourceNames,
  targetNames,
}: {
  sourceNames: string[];
  targetNames: string[];
}) {
  return (
    <div
      role="group"
      aria-label={`Copy from ${sourceNames.join(", ")} to ${targetNames.join(", ")}`}
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5"
    >
      <StackHeading text="From" count={sourceNames.length} />
      <span aria-hidden="true" />
      <StackHeading text="To" count={targetNames.length} />
      <SolutionStack listLabel="Source solutions" names={sourceNames} />
      <div className="flex flex-col items-center gap-1 text-accent-text" aria-hidden="true">
        <div className="flex items-center">
          <span className="h-px w-6 bg-accent-text" />
          <ArrowRight size={18} className="-ml-1" />
        </div>
        <span className="text-xs text-fg-muted">copy</span>
      </div>
      <SolutionStack listLabel="Target solutions" names={targetNames} target />
    </div>
  );
}

function StackHeading({ text, count }: { text: string; count: number }) {
  return (
    <span className="self-end text-xs font-medium text-fg-muted">
      {text}
      <span className="ml-1">({count})</span>
    </span>
  );
}

function SolutionStack({
  listLabel,
  names,
  target = false,
}: {
  listLabel: string;
  names: string[];
  target?: boolean;
}) {
  return (
    <ul aria-label={listLabel} className="m-0 flex max-h-32 min-w-0 list-none flex-col gap-1.5 overflow-auto p-0">
      {names.map((name) => (
        <li
          key={name}
          title={name}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm",
            target
              ? "border-accent-text bg-accent-soft text-fg-strong"
              : "border-line bg-raised text-fg-strong",
          )}
        >
          <Package
            size={14}
            aria-hidden="true"
            className={cn("shrink-0", target ? "text-accent-text" : "text-fg-muted")}
          />
          <span className="truncate">{name}</span>
        </li>
      ))}
    </ul>
  );
}
