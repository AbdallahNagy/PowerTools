import {
  Box,
  Braces,
  Database,
  Eye,
  Globe,
  Link,
  List,
  Package,
  Pencil,
  Plug,
  Plus,
  Search,
  Table2,
  Trash2,
  Unlink,
  type LucideIcon,
} from "lucide-react";

import type { McpToolInfo } from "../../../platform/desktopBridge";

/** How the Agent tools and Agent activity tabs name and draw a tool group. Unknown groups fall back to their id. */
const GROUPS: Record<string, { label: string; description: string; icon: LucideIcon }> = {
  records: { label: "Records", description: "Read and edit rows in your tables.", icon: Table2 },
  metadata: { label: "Table metadata", description: "Read tables, columns, relationships, forms and views.", icon: Database },
  schema: { label: "Schema", description: "Create and change tables, columns, choices and relationships.", icon: Box },
  solutions: { label: "Solutions", description: "Create solutions and manage their components and layers.", icon: Package },
  plugins: { label: "Plugins", description: "Register assemblies, steps and images.", icon: Plug },
  envvars: { label: "Environment variables", description: "Read and set values per environment.", icon: Braces },
  connections: { label: "Connections", description: "See which environments you are signed in to.", icon: Globe },
};

export function groupDisplay(group: string): { label: string; description: string; icon: LucideIcon } {
  return GROUPS[group] ?? { label: group, description: "", icon: Box };
}

/** Picks an icon from the verb in a tool's name, so a new tool gets one without a list to keep up to date. */
const VERBS: Array<[RegExp, LucideIcon]> = [
  [/_disassociate\b|_remove_/, Unlink],
  [/_associate\b|_add_/, Link],
  [/_delete\b|_unregister\b/, Trash2],
  [/_create|_register|_clone\b/, Plus],
  [/_update|_set_|_publish\b/, Pencil],
  [/_query\b/, Search],
  [/_list/, List],
  [/_get/, Eye],
];

export function toolIcon(name: string, effect: McpToolInfo["effect"]): LucideIcon {
  for (const [pattern, icon] of VERBS) if (pattern.test(name)) return icon;
  return effect === "read" ? Search : Pencil;
}

/** "Just now", "5 min ago", or the clock time for anything older than an hour. */
export function relativeTime(time: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - time.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
