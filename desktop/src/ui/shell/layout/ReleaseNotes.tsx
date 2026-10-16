import type { ReleaseNoteBlock } from "./updateStatus";

/** Renders release notes blocks as plain React text. */
export function ReleaseNotes({ blocks }: { blocks: ReleaseNoteBlock[] }) {
  // Group consecutive items into one list so screen readers announce them as a list.
  const groups: Array<{ kind: "heading" | "paragraph"; text: string } | { kind: "list"; items: string[] }> = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (block.kind === "item") {
      if (last?.kind === "list") {
        last.items.push(block.text);
      } else {
        groups.push({ kind: "list", items: [block.text] });
      }
    } else {
      groups.push({ kind: block.kind, text: block.text });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group, index) => {
        if (group.kind === "heading") {
          return (
            <p key={index} className="font-semibold text-fg-strong">
              {group.text}
            </p>
          );
        }
        if (group.kind === "list") {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1">
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{group.text}</p>;
      })}
    </div>
  );
}
