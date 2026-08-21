import { defineTool } from "../defineTool";
import WelcomeTab from "./index";

export const welcomeTool = defineTool({
  id: "welcome",
  title: "Welcome",
  icon: "",
  showInActivityBar: false,
  component: WelcomeTab,
  allowMultipleInstances: false,
});
