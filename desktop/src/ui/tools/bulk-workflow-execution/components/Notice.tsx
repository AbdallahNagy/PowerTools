import type { ReactNode } from "react";
import { Spinner } from "../../../shared/ui";

/** An error line. The word "Error:" keeps the meaning without relying on colour. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" data-tone="danger" className="text-sm text-danger">
      <span className="font-semibold">Error:</span> {children}
    </p>
  );
}

/** A warning line. The word "Warning:" keeps the meaning without relying on colour. */
export function WarningLine({ children }: { children: ReactNode }) {
  return (
    <p data-tone="warn" className="text-sm text-warn">
      <span className="font-semibold">Warning:</span> {children}
    </p>
  );
}

export function LoadingLine({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center gap-2 text-sm text-fg">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
