import { useId } from "react";
import { Copy, Package } from "lucide-react";
import { cn } from "../../../shared/ui";

/** Card height (h-9) and gap between cards (gap-2), in pixels. The connectors use the same numbers. */
const CARD_HEIGHT = 36;
const CARD_GAP = 8;
/** At most this many cards per side; past it, the last card reads "+N more". */
export const MAX_VISIBLE_CARDS = 4;
const CONNECTOR_WIDTH = 120;
const HUB_RADIUS = 16;

/**
 * Shows where a copy goes as a diagram: source solution cards on the left
 * flow into a copy node, which fans out to the target solution cards.
 */
export function CopyRoute({
  sourceNames,
  targetNames,
}: {
  sourceNames: string[];
  targetNames: string[];
}) {
  const sources = visibleCards(sourceNames);
  const targets = visibleCards(targetNames);
  const height = Math.max(stackHeight(sources.length), stackHeight(targets.length), CARD_HEIGHT);

  return (
    <div
      role="group"
      aria-label={`Copy from ${sourceNames.join(", ")} to ${targetNames.join(", ")}`}
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-1.5 rounded-sm border border-line bg-canvas p-3"
    >
      <StackHeading text="From" count={sourceNames.length} />
      <span aria-hidden="true" />
      <StackHeading text="To" count={targetNames.length} />
      <SolutionStack listLabel="Source solutions" cards={sources} height={height} />
      <Connectors sourceCount={sources.length} targetCount={targets.length} height={height} />
      <SolutionStack listLabel="Target solutions" cards={targets} height={height} target />
    </div>
  );
}

interface Card {
  key: string;
  text: string;
  title: string;
  more: boolean;
}

function visibleCards(names: string[]): Card[] {
  const cards = (list: string[]) =>
    list.map((name, index) => ({ key: `${index}:${name}`, text: name, title: name, more: false }));
  if (names.length <= MAX_VISIBLE_CARDS) return cards(names);
  const shown = names.slice(0, MAX_VISIBLE_CARDS - 1);
  const hidden = names.slice(MAX_VISIBLE_CARDS - 1);
  return [
    ...cards(shown),
    { key: "more", text: `+${hidden.length} more`, title: hidden.join("\n"), more: true },
  ];
}

function stackHeight(count: number): number {
  return count === 0 ? 0 : count * CARD_HEIGHT + (count - 1) * CARD_GAP;
}

/** Vertical centre of each card in a stack that is centred in `height`. */
function cardCentres(count: number, height: number): number[] {
  const top = (height - stackHeight(count)) / 2;
  return Array.from({ length: count }, (_, index) => top + index * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2);
}

function curve(x0: number, y0: number, x1: number, y1: number): string {
  const middle = (x0 + x1) / 2;
  return `M ${x0} ${y0} C ${middle} ${y0}, ${middle} ${y1}, ${x1} ${y1}`;
}

function Connectors({
  sourceCount,
  targetCount,
  height,
}: {
  sourceCount: number;
  targetCount: number;
  height: number;
}) {
  const markerId = `copy-route-arrow-${useId().replace(/:/g, "")}`;
  const hubX = CONNECTOR_WIDTH / 2;
  const hubY = height / 2;
  const arrowEnd = CONNECTOR_WIDTH - 2;

  return (
    <div className="relative" style={{ width: CONNECTOR_WIDTH, height }} aria-hidden="true">
      <svg
        width={CONNECTOR_WIDTH}
        height={height}
        viewBox={`0 0 ${CONNECTOR_WIDTH} ${height}`}
        className="absolute inset-0 overflow-visible"
        fill="none"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 1 1 L 9 5 L 1 9 z" className="fill-accent-text" />
          </marker>
        </defs>
        {cardCentres(sourceCount, height).map((y, index) => (
          <path
            key={`source-${index}`}
            d={curve(0, y, hubX - HUB_RADIUS, hubY)}
            className="stroke-line-strong"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}
        {cardCentres(targetCount, height).map((y, index) => (
          <path
            key={`target-${index}`}
            d={curve(hubX + HUB_RADIUS, hubY, arrowEnd, y)}
            className="stroke-accent-text"
            strokeWidth={1.5}
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
          />
        ))}
      </svg>
      <div
        className="absolute flex items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm ring-4 ring-canvas"
        style={{
          width: HUB_RADIUS * 2,
          height: HUB_RADIUS * 2,
          left: hubX - HUB_RADIUS,
          top: hubY - HUB_RADIUS,
        }}
      >
        <Copy size={15} strokeWidth={2} />
      </div>
    </div>
  );
}

function StackHeading({ text, count }: { text: string; count: number }) {
  return (
    <span className="text-xs font-medium text-fg-muted">
      {text}
      <span className="ml-1">({count})</span>
    </span>
  );
}

function SolutionStack({
  listLabel,
  cards,
  height,
  target = false,
}: {
  listLabel: string;
  cards: Card[];
  height: number;
  target?: boolean;
}) {
  return (
    <ul
      aria-label={listLabel}
      className="m-0 flex min-w-0 list-none flex-col justify-center gap-2 p-0"
      style={{ height }}
    >
      {cards.map((card) => (
        <li
          key={card.key}
          title={card.title}
          className={cn(
            "flex h-9 min-w-0 shrink-0 items-center gap-2 rounded-sm border px-2.5 text-sm",
            card.more
              ? "border-dashed border-line-strong bg-surface text-fg-muted"
              : target
                ? "border-accent-text bg-accent-soft text-fg-strong"
                : "border-line bg-raised text-fg-strong",
          )}
        >
          {card.more ? null : (
            <Package
              size={14}
              aria-hidden="true"
              className={cn("shrink-0", target ? "text-accent-text" : "text-fg-muted")}
            />
          )}
          <span className="truncate">{card.text}</span>
        </li>
      ))}
    </ul>
  );
}
