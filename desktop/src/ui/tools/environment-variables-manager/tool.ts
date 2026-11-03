import { defineTool } from "../defineTool";
import EnvironmentVariablesManagerIcon from "./environment-variables-manager-icon.svg";
import EnvironmentVariablesManager from "./EnvironmentVariablesManager";

export const environmentVariablesManagerTool = defineTool({
  id: "environment-variables-manager",
  title: "Environment Variables Manager",
  tooltip: "List and edit environment variable values, and create, update, or delete their definitions",
  icon: EnvironmentVariablesManagerIcon,
  showInActivityBar: true,
  component: EnvironmentVariablesManager,
  allowMultipleInstances: true,
});
