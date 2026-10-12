import type { TablesResponse } from "../model/types";

export const tablesFixture: TablesResponse = {
  tables: [
    { logicalName: "account", schemaName: "Account", displayName: "Account", isCustom: false },
    { logicalName: "contact", schemaName: "Contact", displayName: "Contact", isCustom: false },
    { logicalName: "new_project", schemaName: "new_Project", displayName: "Project", isCustom: true },
  ],
};
