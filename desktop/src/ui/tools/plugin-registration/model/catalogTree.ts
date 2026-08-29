import type {
  PluginAssembly,
  PluginHandler,
  PluginImage,
  PluginRegistrationCatalog,
  PluginStep,
} from "./contracts";

export type CatalogNodeKind = "assembly" | "plugin" | "workflowActivity" | "step" | "image";

interface CatalogTreeNodeBase<TKind extends CatalogNodeKind, TData> {
  id: string;
  kind: TKind;
  label: string;
  data: TData;
  children: CatalogTreeNode[];
}

export type CatalogTreeNode =
  | CatalogTreeNodeBase<"assembly", PluginAssembly>
  | CatalogTreeNodeBase<"plugin", PluginHandler & { kind: "plugin" }>
  | CatalogTreeNodeBase<"workflowActivity", PluginHandler & { kind: "workflowActivity" }>
  | CatalogTreeNodeBase<"step", PluginStep>
  | CatalogTreeNodeBase<"image", PluginImage>;

export function buildCatalogTree(catalog: PluginRegistrationCatalog): CatalogTreeNode[] {
  return catalog.assemblies.map((assembly) => ({
    id: `assembly:${assembly.id}`,
    kind: "assembly",
    label: assembly.name,
    data: assembly,
    children: assembly.handlers.map(buildHandlerNode),
  }));
}

export function filterCatalogTree(nodes: CatalogTreeNode[], searchTerm: string): CatalogTreeNode[] {
  const normalizedTerm = searchTerm.trim().toLocaleLowerCase();
  if (!normalizedTerm) return nodes;

  return nodes.flatMap((node) => {
    const children = filterCatalogTree(node.children, normalizedTerm);
    if (!matchesSearch(node, normalizedTerm) && children.length === 0) return [];

    return [{ ...node, children }];
  });
}

export function findCatalogNode(
  nodes: CatalogTreeNode[],
  nodeId: string,
): CatalogTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const descendant = findCatalogNode(node.children, nodeId);
    if (descendant) return descendant;
  }

  return undefined;
}

function buildHandlerNode(handler: PluginHandler): CatalogTreeNode {
  if (handler.kind === "workflowActivity") {
    return {
      id: `workflowActivity:${handler.id}`,
      kind: "workflowActivity",
      label: `(Workflow Activity) ${handler.name}`,
      data: handler,
      children: [],
    };
  }

  return {
    id: `plugin:${handler.id}`,
    kind: "plugin",
    label: `(Plugin) ${handler.name}`,
    data: handler,
    children: handler.steps.map((step) => ({
      id: `step:${step.id}`,
      kind: "step",
      label: `(Step) ${step.name}`,
      data: step,
      children: step.images.map((image) => ({
        id: `image:${image.id}`,
        kind: "image",
        label: `(Image) ${image.name}`,
        data: image,
        children: [],
      })),
    })),
  };
}

function matchesSearch(node: CatalogTreeNode, normalizedTerm: string): boolean {
  return searchFields(node).some((field) => field.toLocaleLowerCase().includes(normalizedTerm));
}

function searchFields(node: CatalogTreeNode): string[] {
  switch (node.kind) {
    case "assembly":
      return [node.data.name, node.data.description, node.data.solutionDisplayName].filter(isString);
    case "plugin":
    case "workflowActivity":
      return [
        node.data.name,
        node.data.typeName,
        node.data.friendlyName,
        node.data.description,
        node.data.workflowActivityGroupName,
        node.data.solutionDisplayName,
      ].filter(isString);
    case "step":
      return [
        node.data.name,
        node.data.description,
        node.data.messageLabel,
        node.data.primaryTableLabel,
        node.data.secondaryTableLabel,
        node.data.stageLabel,
        node.data.modeLabel,
        node.data.solutionDisplayName,
      ].filter(isString);
    case "image":
      return [
        node.data.name,
        node.data.description,
        node.data.imageTypeLabel,
        node.data.entityAlias,
        node.data.solutionDisplayName,
        ...node.data.attributes,
      ].filter(isString);
  }
}

function isString(value: string | null): value is string {
  return value !== null;
}
