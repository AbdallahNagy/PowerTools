import { defineTool } from "../defineTool";
import DataMigrationIcon from "./data-migration-icon.svg";
import DataMigration from "./DataMigration";

export const dataMigrationTool = defineTool({
  id: "data-migration",
  title: "Data Migration",
  tooltip: "data migration",
  icon: DataMigrationIcon,
  showInActivityBar: true,
  component: DataMigration,
  allowMultipleInstances: true,
});
