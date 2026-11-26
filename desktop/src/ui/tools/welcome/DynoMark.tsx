/*
 * The Dyno mark: a ring with one piece missing at the upper right, and the lime piece that
 * completes it. Geometry is measured from the logo artwork (dyno-icon-light-1024.png), so the
 * gaps between the ring and the piece stay as they are in the icon.
 */

/** The ring's arc, from 103° to 347° clockwise from the top, on a circle of radius 22.4 around (50, 50). */
const RING = "M71.83 55.04 A22.4 22.4 0 1 1 44.96 28.18";
/** The missing piece, from 20° to 70°. */
const PIECE = "M57.66 28.95 A22.4 22.4 0 0 1 71.05 42.34";
const STROKE = 10.4;

export function DynoMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="22 22 56 56"
      className={className}
    >
      <path d={RING} fill="none" stroke="var(--color-brand-ring)" strokeWidth={STROKE} strokeLinecap="round" />
      <path d={PIECE} fill="none" stroke="var(--color-brand)" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** The lowercase "dyno" wordmark, whose "o" is the mark. */
export function DynoWordmark() {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label="dyno"
        className="flex items-end font-brand text-[64px] font-black leading-[0.85] tracking-[-0.03em] text-brand-ring"
      >
        <span aria-hidden="true">dyn</span>
        <DynoMark size={44} className="mb-px ml-[3px]" />
      </div>
      <span className="font-brand text-sm font-extrabold text-fg-muted">Dynamics toolbox + MCP server</span>
    </div>
  );
}
