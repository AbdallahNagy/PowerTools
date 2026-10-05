import { defineTool } from "../defineTool";
import BulkWorkflowExecutionIcon from "./bulk-workflow-execution-icon.svg";
import BulkWorkflowExecution from "./BulkWorkflowExecution";

export const bulkWorkflowExecutionTool = defineTool({
  id: "bulk-workflow-execution",
  title: "Bulk Workflow Execution",
  tooltip: "Run an on-demand workflow against every record a view or FetchXML query returns",
  icon: BulkWorkflowExecutionIcon,
  showInActivityBar: true,
  component: BulkWorkflowExecution,
  allowMultipleInstances: true,
});
