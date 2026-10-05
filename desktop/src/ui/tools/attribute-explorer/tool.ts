import { defineTool } from "../defineTool";
import AttributeExplorer from "./AttributeExplorer";
import AttributeExplorerIcon from "./attribute-explorer-icon.svg";

export const attributeExplorerTool = defineTool({
  id: "attribute-explorer",
  title: "Attribute Explorer",
  tooltip: "Browse every table in an environment and inspect its fields, types, and lookups",
  icon: AttributeExplorerIcon,
  showInActivityBar: true,
  component: AttributeExplorer,
  allowMultipleInstances: true,
});
