import { defineTool } from "../defineTool";
import FetchXmlBuilder, { FetchXmlBuilderIcon } from ".";

export const fetchXmlBuilderTool = defineTool({
  id: "fetchxml-builder",
  title: "FetchXML Builder",
  tooltip: "Build, run, and refine FetchXML queries",
  icon: FetchXmlBuilderIcon,
  showInActivityBar: true,
  component: FetchXmlBuilder,
  allowMultipleInstances: true,
});
