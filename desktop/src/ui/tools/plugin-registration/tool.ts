import { defineTool } from "../defineTool";
import PluginRegistrationIcon from "./plugin-registration-icon.svg";
import PluginRegistration from "./PluginRegistration";

export const pluginRegistrationTool = defineTool({
  id: "plugin-registration",
  title: "Plugin Registration",
  tooltip: "",
  icon: PluginRegistrationIcon,
  showInActivityBar: true,
  component: PluginRegistration,
  allowMultipleInstances: true,
});
