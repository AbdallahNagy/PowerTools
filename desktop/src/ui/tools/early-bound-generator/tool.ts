import { defineTool } from "../defineTool";
import EarlyBoundGenerator from "./EarlyBoundGenerator";
import EarlyBoundGeneratorIcon from "./early-bound-generator-icon.svg";

export const earlyBoundGeneratorTool = defineTool({
  id: "early-bound-generator",
  title: "Early Bound Generator",
  tooltip: "Generate typed C# classes for the tables you pick",
  icon: EarlyBoundGeneratorIcon,
  showInActivityBar: true,
  component: EarlyBoundGenerator,
  allowMultipleInstances: true,
});
