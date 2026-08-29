import { useEffect, useRef } from "react";

import type { CatalogTreeNode } from "../model/catalogTree";

export type RegistrationActionIntent =
  | { kind: "update"; nodeId: string }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | { kind: "unregister"; nodeId: string }
  | { kind: "toggleStep"; stepId: string; enable: boolean };

export interface RegistrationContextMenuState {
  node: CatalogTreeNode;
  x: number;
  y: number;
  anchor: HTMLButtonElement;
}

interface RegistrationContextMenuProps {
  state: RegistrationContextMenuState | null;
  onAction: (intent: RegistrationActionIntent) => void;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  intent: RegistrationActionIntent;
}

export function RegistrationContextMenu({ state, onAction, onClose }: RegistrationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();

    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      state.anchor.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [onClose, state]);

  if (!state) return null;

  const items = menuItemsForNode(state.node);
  const left = Math.min(Math.max(8, state.x), Math.max(8, window.innerWidth - 232));
  const estimatedHeight = items.length * 32 + 16;
  const top = Math.min(Math.max(8, state.y), Math.max(8, window.innerHeight - estimatedHeight));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${state.node.label} actions`}
      className="fixed z-40 w-56 py-1 bg-[#252526] border border-[#555] rounded-sm shadow-xl"
      style={{ left, top }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="w-full px-3 py-1.5 text-left text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white focus:outline-none focus:bg-[#094771] focus:text-white"
          onClick={() => {
            onAction(item.intent);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function menuItemsForNode(node: CatalogTreeNode): MenuItem[] {
  const update = (label: string): MenuItem => ({ label, intent: { kind: "update", nodeId: node.id } });
  const unregister = (label: string): MenuItem => ({ label, intent: { kind: "unregister", nodeId: node.id } });

  switch (node.kind) {
    case "assembly":
      return [update("Update assembly"), unregister("Unregister assembly")];
    case "plugin":
      return [
        { label: "Register step", intent: { kind: "createStep", pluginId: node.data.id } },
        unregister("Unregister plug-in"),
      ];
    case "workflowActivity":
      return [update("Update workflow activity"), unregister("Unregister workflow activity")];
    case "step":
      return [
        update("Update step"),
        { label: "Register image", intent: { kind: "createImage", stepId: node.data.id } },
        {
          label: node.data.isEnabled ? "Disable step" : "Enable step",
          intent: { kind: "toggleStep", stepId: node.data.id, enable: !node.data.isEnabled },
        },
        unregister("Unregister step"),
      ];
    case "image":
      return [update("Update image"), unregister("Unregister image")];
  }
}
