import type { ReactNode } from "react";

export interface TabData {
  /** Unique instance id (e.g. "data-migration-1718000000000"). */
  id: string;
  /** Display label shown in the tab header. */
  title: string;
  /**
   * Registry key resolved at render time to the tool component.
   * Use "welcome" (or any other reserved id) for static, non-registry tabs.
   */
  toolId: string;
  /**
   * Optional static content used for special tabs (e.g. Welcome) that are
   * not backed by a tool in the registry.
   */
  content?: ReactNode;
}