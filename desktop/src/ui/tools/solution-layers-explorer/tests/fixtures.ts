import type {
  ComponentsResponse,
  ComponentTypesResponse,
  Layer,
  LayersResponse,
} from "../model/types";

export const scriptId = "aaaaaaaa-0000-0000-0000-000000000001";
export const styleId = "aaaaaaaa-0000-0000-0000-000000000002";

export const componentTypesFixture: ComponentTypesResponse = {
  componentTypes: [
    { componentType: 1, name: "Entity", layerName: "Entity", label: "Table", supported: true },
    { componentType: 2, name: "Attribute", layerName: "Attribute", label: "Column", supported: true },
    { componentType: 60, name: "SystemForm", layerName: "SystemForm", label: "Form", supported: true },
    { componentType: 26, name: "SavedQuery", layerName: "SavedQuery", label: "View", supported: true },
    { componentType: 61, name: "WebResource", layerName: "WebResource", label: "Web resource", supported: true },
  ],
};

export const webResourcesFixture: ComponentsResponse = {
  components: [
    {
      componentId: styleId,
      componentType: 61,
      name: "Site styles",
      logicalName: "new_/styles/site.css",
      parentEntity: null,
    },
    {
      componentId: scriptId,
      componentType: 61,
      name: "Main script",
      logicalName: "new_/scripts/main.js",
      parentEntity: null,
    },
  ],
  truncated: false,
};

export const tablesFixture: ComponentsResponse = {
  components: [
    {
      componentId: "bbbbbbbb-0000-0000-0000-000000000002",
      componentType: 1,
      name: "Contact",
      logicalName: "contact",
      parentEntity: null,
    },
    {
      componentId: "bbbbbbbb-0000-0000-0000-000000000001",
      componentType: 1,
      name: "Account",
      logicalName: "account",
      parentEntity: null,
    },
  ],
  truncated: false,
};

/** UTF-8 base64 with a byte order mark, as Dataverse stores web resource content. */
export function base64(text: string): string {
  const bytes = new TextEncoder().encode(`${String.fromCharCode(0xfeff)}${text}`);
  return btoa(String.fromCharCode(...bytes));
}

function json(properties: Record<string, unknown>): string {
  return JSON.stringify({
    Attributes: Object.entries(properties).map(([Key, Value]) => ({ Key, Value })),
  });
}

function layer(partial: Partial<Layer> & Pick<Layer, "id" | "order" | "solutionName">): Layer {
  return {
    solutionVersion: null,
    publisherName: "Contoso",
    overwriteTime: "2026-03-04T05:06:07.000Z",
    name: "new_/scripts/main.js",
    isActive: false,
    changes: null,
    componentJson: null,
    children: null,
    ...partial,
  };
}

export const activeLayer = layer({
  id: "layer-active",
  order: 3,
  solutionName: "Active",
  publisherName: "",
  isActive: true,
  changes: json({ content: base64("console.log('active');") }),
  componentJson: json({
    name: "new_/scripts/main.js",
    displayname: "Main script",
    content: base64("console.log('active');"),
  }),
});

export const patchLayer = layer({
  id: "layer-patch",
  order: 2,
  solutionName: "ContosoPatch",
  solutionVersion: "1.2.1.0",
  changes: json({ description: "Patched" }),
  componentJson: json({
    name: "new_/scripts/main.js",
    displayname: "Main script",
    content: base64("console.log('managed');"),
    description: "Patched",
  }),
});

export const baseLayer = layer({
  id: "layer-base",
  order: 1,
  solutionName: "ContosoCore",
  solutionVersion: "1.2.0.0",
  changes: "",
  componentJson: "{not json",
});

export const scriptLayersFixture: LayersResponse = {
  componentId: scriptId,
  componentType: 61,
  layerName: "WebResource",
  hasActiveLayer: true,
  canRemoveActive: true,
  layers: [activeLayer, patchLayer, baseLayer],
};

export const scriptLayersAfterRemoval: LayersResponse = {
  ...scriptLayersFixture,
  hasActiveLayer: false,
  canRemoveActive: false,
  layers: [patchLayer, baseLayer],
};

export const styleLayersFixture: LayersResponse = {
  componentId: styleId,
  componentType: 61,
  layerName: "WebResource",
  hasActiveLayer: true,
  canRemoveActive: false,
  layers: [layer({ id: "style-active", order: 1, solutionName: "Active", isActive: true, publisherName: "" })],
};
