import { defineTool } from "../defineTool";
import RibbonWorkbench from "./RibbonWorkbench";
import RibbonWorkbenchIcon from "./ribbon-workbench-icon.svg";

export const ribbonWorkbenchTool = defineTool({
  id: "ribbon-workbench",
  title: "Ribbon Editor",
  tooltip: "Edit classic command bar buttons, commands and rules in a solution",
  icon: RibbonWorkbenchIcon,
  showInActivityBar: true,
  component: RibbonWorkbench,
  allowMultipleInstances: true,
});
