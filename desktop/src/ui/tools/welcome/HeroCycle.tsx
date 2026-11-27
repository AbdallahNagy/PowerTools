import { DynoMark } from "./DynoMark";

/*
 * The hero picture: Dataverse, Power Platform and Dynamics 365 make up most of a circle, and Dyno
 * is the last piece that completes it. It is the mark, drawn large, with each part labeled.
 * The ring is a circle of radius 140 around (230, 230), at the same angles as the mark.
 */
const RING = "M366.4 261.5 A140 140 0 1 1 198.5 93.6";
const PIECE = "M277.9 98.4 A140 140 0 0 1 361.6 182.1";

const LABELS = [
  { text: "Dynamics 365", left: "12.3%", top: "28.3%" },
  { text: "Power Platform", left: "19.3%", top: "80.7%" },
  { text: "Dataverse", left: "71.7%", top: "87.6%" },
];

export function HeroCycle() {
  return (
    <div
      role="img"
      aria-label="Dataverse, Power Platform and Dynamics 365 form most of a circle. Dyno is the last piece that completes it."
      className="relative aspect-square w-[420px] max-w-full"
    >
      <svg aria-hidden="true" viewBox="0 0 460 460" className="absolute inset-0 h-full w-full overflow-visible">
        <path d={RING} fill="none" stroke="var(--color-brand-ring)" strokeWidth={60} strokeLinecap="round" />
        <path
          d={PIECE}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={60}
          strokeLinecap="round"
          className="welcome-snap-piece"
        />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        <span className="text-sm text-fg-muted">Your Dataverse work,</span>
        <span className="text-4xl font-bold tracking-tight text-fg-strong">in flow</span>
      </div>
      {LABELS.map((label) => (
        <span
          key={label.text}
          aria-hidden="true"
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg-strong"
          style={{ left: label.left, top: label.top }}
        >
          {label.text}
        </span>
      ))}
      <span
        aria-hidden="true"
        className="absolute left-[84%] top-[14%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand bg-surface px-3 py-1.5 font-brand text-base font-black text-fg-strong"
      >
        <DynoMark size={16} />
        dyno
      </span>
    </div>
  );
}
