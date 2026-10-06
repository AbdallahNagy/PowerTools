import type { ReactNode } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "./cn";

interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  className?: string;
}

/** In-tool tabs, such as Results / FetchXML. Arrow keys move between tabs. */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: TabsProps) {
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={cn("flex flex-col min-h-0", className)}
    >
      <TabsPrimitive.List aria-label={ariaLabel} className="flex shrink-0 gap-1 border-b border-line">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-fg-muted",
              "hover:text-fg data-[state=active]:border-accent-text data-[state=active]:text-fg-strong",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="flex-1 min-h-0 focus:outline-none">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
