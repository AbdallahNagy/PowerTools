import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  value: string;
  /** Accessible name, for example "Copy logical name". */
  label: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg-strong focus:outline-none focus-visible:ring-1 focus-visible:ring-focus"
    >
      {copied ? (
        <svg
          data-testid="copied-icon"
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="11" height="11" rx="1.5" />
          <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
        </svg>
      )}
    </button>
  );
}
