import type { AssemblyMutationPreflight } from "../api/useAssemblyMutations";

export interface AssemblyImpactTreeNode {
  id: string;
  label: string;
  change: "added" | "removed";
  children: AssemblyImpactTreeNode[];
}

const ownedStepPattern = /^(?<plugin>.+): step '(?<step>[^']+)'(?:, image '(?<image>[^']+)')?$/;

export function buildAssemblyImpactTree(impact: AssemblyMutationPreflight["impact"]): AssemblyImpactTreeNode[] {
  const stepsByPlugin = new Map<string, string[]>();
  for (const owned of impact.ownedStepsAndImages) {
    const match = ownedStepPattern.exec(owned);
    if (!match?.groups?.plugin || !match.groups.step) continue;
    const steps = stepsByPlugin.get(match.groups.plugin) ?? [];
    if (!steps.includes(match.groups.step)) steps.push(match.groups.step);
    stepsByPlugin.set(match.groups.plugin, steps);
  }

  const added = impact.addedPlugins.map((plugin) => ({
    id: `added:${plugin}`,
    label: `(Plugin) ${plugin}`,
    change: "added" as const,
    children: [],
  }));
  const removed = impact.removedPlugins.map((plugin) => ({
    id: `removed:${plugin}`,
    label: `(Plugin) ${plugin}`,
    change: "removed" as const,
    children: (stepsByPlugin.get(plugin) ?? []).map((step) => ({
      id: `removed:${plugin}:${step}`,
      label: `(Step) ${step}`,
      change: "removed" as const,
      children: [],
    })),
  }));
  return [...added, ...removed];
}
