import {
  Box,
  Database,
  Eye,
  Globe,
  LayoutGrid,
  Link,
  List,
  Package,
  Pencil,
  Plug,
  Plus,
  Search,
  Shield,
  Table2,
  Trash2,
  Unlink,
  type LucideIcon,
} from "lucide-react";

import type { McpToolInfo } from "../../../platform/desktopBridge";

/** How the Agent tools and Agent activity tabs name and draw a tool group. Unknown groups fall back to their id. */
const GROUPS: Record<string, { label: string; description: string; icon: LucideIcon }> = {
  connections: { label: "Connections", description: "See which environments you are signed in to.", icon: Globe },
  read: { label: "Read", description: "Read tables, forms, views, solutions, plug-ins and records.", icon: Eye },
  records: { label: "Records", description: "Create, update and relate rows, and run Dataverse messages.", icon: Table2 },
  "records-delete": { label: "Record deletes", description: "Delete rows and remove links between them.", icon: Trash2 },
  schema: { label: "Schema", description: "Create and change tables, columns, keys and choices.", icon: Database },
  ui: { label: "Apps, forms and views", description: "Change apps, forms, dashboards, views and web resources.", icon: LayoutGrid },
  logic: { label: "Plug-ins, APIs and flows", description: "Deploy plug-in assemblies, register their steps, define Custom APIs and build cloud flows.", icon: Plug },
  security: { label: "Security", description: "Change security roles, who has them, and field security profiles.", icon: Shield },
  solutions: { label: "Solutions", description: "Manage solutions, patches, environment variables and imports.", icon: Package },
  remove: { label: "Remove components", description: "Delete tables, columns, forms, plug-ins and other components.", icon: Unlink },
};

export function groupDisplay(group: string): { label: string; description: string; icon: LucideIcon } {
  return GROUPS[group] ?? { label: group, description: "", icon: Box };
}

/** Picks an icon from the verb in a tool's name, so a new tool gets one without a list to keep up to date. */
const VERBS: Array<[RegExp, LucideIcon]> = [
  [/^remove$|_disassociate\b|_remove_/, Unlink],
  [/_associate\b|_add_/, Link],
  [/_delete\b|_unregister\b/, Trash2],
  [/_import\b|_deploy\b/, Plus],
  [/_create|_register|_clone\b/, Plus],
  [/_apply\b|_write\b|_update|_set_|_publish\b/, Pencil],
  [/_query\b/, Search],
  [/_list/, List],
  [/^inspect_|_get/, Eye],
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
