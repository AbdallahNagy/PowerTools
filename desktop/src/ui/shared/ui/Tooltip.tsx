import type { ReactElement, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

interface TooltipProps {
  content: ReactNode;
  /** One focusable element, such as an icon Button. */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  /** Keeps the tooltip closed without changing the element tree, so a focused child keeps focus. */
  disabled?: boolean;
}

/** Short hint on hover and keyboard focus. Not a replacement for a visible label. */
export function Tooltip({ content, children, side = "top", disabled = false }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={400}>
      <TooltipPrimitive.Root open={disabled ? false : undefined}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-[100] max-w-xs rounded-sm border border-line bg-raised px-2 py-1 text-xs text-fg shadow-lg"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
