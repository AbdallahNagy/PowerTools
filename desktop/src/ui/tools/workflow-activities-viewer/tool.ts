import { defineTool } from "../defineTool";
import WorkflowActivitiesIcon from "./workflow-activities-icon.svg";
import WorkflowActivitiesViewer from "./WorkflowActivitiesViewer";

export const workflowActivitiesTool = defineTool({
  id: "workflow-activities-viewer",
  title: "Workflow Activities Viewer",
  tooltip: "See which activated processes reference a custom workflow activity",
  icon: WorkflowActivitiesIcon,
  showInActivityBar: true,
  component: WorkflowActivitiesViewer,
  allowMultipleInstances: false,
});
