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

/*
 * The wordmark's "o" is drawn at the weight of the letters around it, so it is heavier than the
 * icon. The arcs are shorter than the icon's to keep a clear gap on each side of the lime piece
 * at that weight: each rounded end reaches about 28° past its arc, and the ends sit 68° apart.
 */
const WORD_RING = "M63.71 62.79 A18.75 18.75 0 1 1 37.21 36.29";
const WORD_PIECE = "M57.92 33.01 A18.75 18.75 0 0 1 66.99 42.08";
const WORD_STROKE = 18.5;

/** The lowercase "dyno" wordmark, whose "o" is the mark at letter weight. */
export function DynoWordmark() {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label="dyno"
        className="font-brand text-[64px] font-black leading-none tracking-[-0.03em] text-brand-ring"
      >
        <span aria-hidden="true">
          dyn
          <svg
            aria-hidden="true"
            viewBox="22 22 56 56"
            className="ml-[0.02em] inline-block h-[0.53em] w-[0.53em] align-baseline"
          >
            <path d={WORD_RING} fill="none" stroke="var(--color-brand-ring)" strokeWidth={WORD_STROKE} strokeLinecap="round" />
            <path d={WORD_PIECE} fill="none" stroke="var(--color-brand)" strokeWidth={WORD_STROKE} strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <span className="font-brand text-sm font-extrabold text-fg-muted">Dynamics toolbox + MCP server</span>
    </div>
  );
}
