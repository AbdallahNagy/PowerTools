import { useEffect, useRef, useState } from "react";
import type { MigrationJobStatus } from "../../../api/hooks/useMigrationJob";

interface MigrationStatusItemProps {
  entityLogicalName: string;
  job: MigrationJobStatus;
}

export function MigrationStatusItem({
  entityLogicalName,
  job,
}: MigrationStatusItemProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const running = job.status === "queued" || job.status === "running";
  const label = running
    ? `⟳ ${entityLogicalName} ${job.processed}/${job.total || "?"} ✓${job.succeeded} ✗${job.failed}`
    : job.failed > 0
      ? `⚠ ${entityLogicalName}: ${job.succeeded} ok, ${job.failed} failed`
      : `✓ ${entityLogicalName}: ${job.succeeded} migrated`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-white/15 px-1 rounded cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-96 max-h-64 overflow-auto bg-[#252526] text-[#cccccc] border border-black/40 rounded shadow-lg z-50">
          <div className="px-3 py-1.5 text-xs border-b border-black/40">
            {job.processed}/{job.total || "?"} processed · {job.succeeded}{" "}
            succeeded · {job.failed} failed
          </div>
          {job.errors.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#858585]">No errors.</div>
          ) : (
            job.errors.map((e, i) => (
              <div
                key={i}
                className="px-3 py-2 border-b border-black/20 last:border-0"
              >
                <p className="text-xs text-[#858585]">
                  Record:{" "}
                  <span className="text-[#cccccc] font-mono">{e.recordId}</span>
                </p>
                <p className="text-xs text-[#f48771] mt-0.5">{e.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
