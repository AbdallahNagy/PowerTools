import type { ReactElement, ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}

interface MenuProps {
  /** One button that opens the menu. */
  trigger: ReactElement;
  /** Items; `null` draws a separator. */
  items: (MenuItem | null)[];
  align?: "start" | "center" | "end";
}

/** Dropdown menu with keyboard navigation and type-ahead. */
export function Menu({ trigger, items, align = "start" }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-[100] min-w-44 rounded-sm border border-line bg-raised p-1 text-sm text-fg shadow-lg"
        >
          {items.map((item, index) =>
            item === null ? (
              <DropdownMenu.Separator key={`separator-${index}`} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={index}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
                  "data-[highlighted]:bg-hover data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
                  item.danger && "text-danger",
                )}
              >
                {item.icon ? <item.icon size={14} aria-hidden="true" /> : null}
                <span className="flex-1">{item.label}</span>
                {item.shortcut ? <span className="text-xs text-fg-muted">{item.shortcut}</span> : null}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
