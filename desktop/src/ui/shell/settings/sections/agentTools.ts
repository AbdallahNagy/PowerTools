/** How the Agent tools tab names a tool group. Unknown groups fall back to their id. */
const GROUPS: Record<string, { label: string; description: string }> = {
  connections: { label: "Connections", description: "See which environments you are signed in to." },
  read: { label: "Read", description: "Read tables, forms, views, solutions, plug-ins and records." },
  records: { label: "Records", description: "Create, update and relate rows, and run Dataverse messages." },
  "records-delete": { label: "Record deletes", description: "Delete rows and remove links between them." },
  schema: { label: "Schema", description: "Create and change tables, columns, keys and choices." },
  ui: { label: "Apps, forms and views", description: "Change apps, forms, dashboards, views and web resources." },
  logic: { label: "Plug-ins, APIs and processes", description: "Deploy plug-in assemblies, register their steps, define Custom APIs, and build cloud flows and classic workflows." },
  security: { label: "Security", description: "Change security roles, who has them, and field security profiles." },
  solutions: { label: "Solutions", description: "Manage solutions, patches, environment variables and imports." },
  remove: { label: "Remove components", description: "Delete tables, columns, forms, plug-ins and other components." },
};

export function groupDisplay(group: string): { label: string; description: string } {
  return GROUPS[group] ?? { label: group, description: "" };
}

/** "Just now", "5 min ago", or the clock time for anything older than an hour. */
export function relativeTime(time: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - time.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
