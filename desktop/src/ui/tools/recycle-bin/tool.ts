import { defineTool } from "../defineTool";
import RecycleBinIcon from "./recycle-bin-icon.svg";
import RecycleBin from "./RecycleBin";

export const recycleBinTool = defineTool({
  id: "recycle-bin",
  title: "Recycle Bin",
  tooltip: "Find deleted records and restore them from the Dataverse recycle bin or the audit log",
  icon: RecycleBinIcon,
  showInActivityBar: true,
  component: RecycleBin,
  allowMultipleInstances: true,
});
