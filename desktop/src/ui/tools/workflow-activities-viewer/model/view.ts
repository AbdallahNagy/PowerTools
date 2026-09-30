import type { Activity, AssemblyGroup, ProcessRow } from "./types";

export function filterAssemblies(assemblies: readonly AssemblyGroup[], filter: string): AssemblyGroup[] {
  if (filter.length === 0) {
    return assemblies.map((group) => ({ ...group, activities: [...group.activities] }));
  }

  const needle = filter.toLowerCase();
  return assemblies
    .map((group) => ({
      ...group,
      activities: group.activities.filter((activity) => activity.name.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.activities.length > 0);
}

export function activityTotals(assemblies: readonly AssemblyGroup[]) {
  return {
    assemblies: assemblies.length,
    activities: assemblies.reduce((sum, group) => sum + group.activities.length, 0),
  };
}

export function isGroupExpanded(assemblyId: string, filter: string, expanded: ReadonlySet<string>) {
  return filter.length > 0 || expanded.has(assemblyId);
}

export function findActivity(assemblies: readonly AssemblyGroup[], pluginTypeId: string | null): Activity | null {
  if (!pluginTypeId) return null;
  for (const group of assemblies) {
    const activity = group.activities.find((item) => item.pluginTypeId === pluginTypeId);
    if (activity) return activity;
  }
  return null;
}

export function activityStatusName(name: string) {
  return name.trim() ? name : "Unknown";
}

export function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function startConditionsText(process: Pick<
  ProcessRow,
  "onDemand" | "triggerOnCreate" | "triggerOnDelete" | "triggerOnUpdateAttributes"
>) {
  const parts: string[] = [];
  if (process.onDemand) parts.push("On demand");
  if (process.triggerOnCreate) parts.push("Record created");
  if (process.triggerOnUpdateAttributes.length > 0) {
    parts.push(`Columns changed: ${process.triggerOnUpdateAttributes.join(", ")}`);
  }
  if (process.triggerOnDelete) parts.push("Record deleted");
  return parts.length === 0 ? "No start conditions" : parts.join(", ");
}
