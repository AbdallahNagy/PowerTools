/** Display names for a lookup's target tables, falling back to logical names. */
export function targetLabels(
  entities: Array<{ logicalName: string; displayName: string }>,
  targets: string[],
): string {
  return targets
    .map((target) => entities.find((entity) => entity.logicalName === target)?.displayName ?? target)
    .join(", ");
}
