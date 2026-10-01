import { defineTool } from "../defineTool";
import SolutionComponentsMoverIcon from "./solution-components-mover-icon.svg";
import SolutionComponentsMover from "./SolutionComponentsMover";

export const solutionComponentsMoverTool = defineTool({
  id: "solution-components-mover",
  title: "Solution Components Mover",
  tooltip: "Copy solution components from selected solutions into unmanaged solutions in the same environment",
  icon: SolutionComponentsMoverIcon,
  showInActivityBar: true,
  component: SolutionComponentsMover,
  allowMultipleInstances: true,
});
