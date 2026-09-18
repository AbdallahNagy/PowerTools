import type {
  AssemblyDto,
  CatalogDto,
  ImageDto,
  PluginTypeDto,
  StepDto,
} from "./contracts";

export type TreeNodeKind = "assembly" | "type" | "step" | "image";

export type TreeNode =
  | { kind: "assembly"; id: string; label: string; data: AssemblyDto; children: TreeNode[] }
  | { kind: "type"; id: string; label: string; data: PluginTypeDto; children: TreeNode[] }
  | { kind: "step"; id: string; label: string; data: StepDto; children: TreeNode[] }
  | { kind: "image"; id: string; label: string; data: ImageDto; children: [] };

export function nodeId(kind: TreeNodeKind, id: string): string {
  return `${kind}:${id}`;
}

export function buildCatalogTree(
  catalog: CatalogDto,
  opts: { showSystem: boolean; search: string },
): TreeNode[] {
  const typesByAssembly = groupBy(catalog.types, (type) => type.assemblyId);
  const stepsByType = groupBy(catalog.steps, (step) => step.pluginTypeId);
  const imagesByStep = groupBy(catalog.images, (image) => image.stepId);

  const assemblies = catalog.assemblies
    .filter((assembly) => opts.showSystem || !assembly.isSystem)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((assembly) => {
      const types = (typesByAssembly.get(assembly.id) ?? [])
        .filter((type) => opts.showSystem || !type.isSystem)
        .slice()
        .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))
        .map((type) => {
          const steps = (stepsByType.get(type.id) ?? [])
            .filter((step) => opts.showSystem || !step.isSystem)
            .slice()
            .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
            .map((step) => {
              const images = (imagesByStep.get(step.id) ?? [])
                .filter((image) => opts.showSystem || !image.isSystem)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(
                  (image): TreeNode => ({
                    kind: "image",
                    id: nodeId("image", image.id),
                    label: image.name || image.entityAlias,
                    data: image,
                    children: [],
                  }),
                );
              return {
                kind: "step" as const,
                id: nodeId("step", step.id),
                label: step.name,
                data: step,
                children: images,
              };
            });
          return {
            kind: "type" as const,
            id: nodeId("type", type.id),
            label: typeLabel(type),
            data: type,
            children: steps,
          };
        });
      return {
        kind: "assembly" as const,
        id: nodeId("assembly", assembly.id),
        label: assembly.version ? `${assembly.name} (${assembly.version})` : assembly.name,
        data: assembly,
        children: types,
      };
    });

  return filterBySearch(assemblies, opts.search.trim().toLowerCase());
}

export function findNode(nodes: TreeNode[], id: string | null): TreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return null;
}

function typeLabel(type: PluginTypeDto): string {
  return type.friendlyName || type.name || type.typeName;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = map.get(key(item));
    if (group) group.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

function filterBySearch(nodes: TreeNode[], search: string): TreeNode[] {
  if (!search) return nodes;
  return nodes.flatMap((node) => {
    const selfMatches = nodeMatches(node, search);
    if (selfMatches) return [node];
    const children = filterBySearch(node.children, search);
    if (children.length === 0) return [];
    return [{ ...node, children } as TreeNode];
  });
}

function nodeMatches(node: TreeNode, search: string): boolean {
  const fields = [node.label];
  switch (node.kind) {
    case "assembly":
      fields.push(node.data.name, node.data.version ?? "");
      break;
    case "type":
      fields.push(node.data.typeName, node.data.name ?? "", node.data.friendlyName ?? "");
      break;
    case "step":
      fields.push(
        node.data.name,
        node.data.messageName,
        node.data.primaryEntity ?? "",
        node.data.secondaryEntity ?? "",
      );
      break;
    case "image":
      fields.push(node.data.name, node.data.entityAlias);
      break;
  }
  return fields.some((field) => field.toLowerCase().includes(search));
}
