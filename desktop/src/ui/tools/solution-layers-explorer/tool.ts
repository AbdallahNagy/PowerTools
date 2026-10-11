import { defineTool } from "../defineTool";
import SolutionLayersExplorerIcon from "./solution-layers-explorer-icon.svg";
import SolutionLayersExplorer from "./SolutionLayersExplorer";

export const solutionLayersExplorerTool = defineTool({
  id: "solution-layers-explorer",
  title: "Solution Layers Explorer",
  tooltip: "Inspect and compare the solution layers of a component, and remove its unmanaged Active layer",
  icon: SolutionLayersExplorerIcon,
  showInActivityBar: true,
  component: SolutionLayersExplorer,
  allowMultipleInstances: true,
});
