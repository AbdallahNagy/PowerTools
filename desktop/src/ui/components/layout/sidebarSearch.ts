export interface SidebarSearchable {
  title: string;
  tooltip?: string;
}

export function matchesSidebarSearch(
  item: SidebarSearchable,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return (
    item.title.toLowerCase().includes(needle) ||
    (item.tooltip ?? "").toLowerCase().includes(needle)
  );
}

export function filterSidebarItems<T extends SidebarSearchable>(
  items: readonly T[],
  query: string,
): T[] {
  return items.filter((item) => matchesSidebarSearch(item, query));
}
