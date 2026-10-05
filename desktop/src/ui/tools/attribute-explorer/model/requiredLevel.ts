const labels: Record<string, string> = {
  None: "Optional",
  SystemRequired: "System required",
  ApplicationRequired: "Required",
  Recommended: "Recommended",
};

const ranks: Record<string, number> = {
  None: 0,
  Recommended: 1,
  ApplicationRequired: 2,
  SystemRequired: 3,
};

export function requiredLevelLabel(level: string): string {
  return labels[level] ?? level;
}

export function requiredLevelRank(level: string): number {
  return ranks[level] ?? -1;
}
