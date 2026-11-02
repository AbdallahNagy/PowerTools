---
seoTitle: "Dataverse Environment Variables Manager | PowerTools"
seoDescription: "List every Dataverse environment variable with its current value, edit values in place and save them together, and create, update, or delete definitions."
features:
  - List every environment variable with its type, default value, and current value
  - Edit current values in the list and save all your changes at once
  - Validate Number, Boolean, JSON, and Azure Key Vault secret values before saving
  - Create a variable and add it to an unmanaged solution with its publisher prefix
  - Update a definition's display name, description, and default value
  - Delete a variable, or delete only its current value to fall back to the default
---

## Every environment variable in one place

Environment variables keep settings such as API URLs, feature switches, and Key Vault secret references out of your apps and flows. Environment Variables Manager lists every variable in the selected environment with its display name, schema name, type, and the value in effect. When a variable has no current value, the list shows its default value instead. Filter by name, schema name, or value as you type.

Variables whose value came in with a managed solution are marked, so you know a later import may replace a value you change.

## Edit values and save them together

Change current values directly in the list. Text and numbers get a text box, Yes/No variables get a yes or no choice, and JSON and secret values open a dedicated editor in the details pane. Secret values are built from the parts of an Azure Key Vault path. PowerTools never reads the secret itself.

Each value is checked against its type before anything is sent, because Dataverse does not validate values itself. Choose **Save Changes** to save every edit at once. A value row is created when the variable has none and updated when it does. Each row shows whether it saved or failed, and a failed row keeps your edit so you can fix it and try again.

## Manage definitions

Create a variable with its schema name, display name, type, description, and default value, and optionally add it to an unmanaged solution. The schema name has to start with that solution publisher's prefix. For an existing variable you can change its display name, description, and default value. Its schema name and type stay locked.

Delete a variable or only its current value after a confirmation. Definitions and values that came from a managed solution cannot be deleted, and a variable that a flow or app still uses is reported instead of deleted.

## When to use it

- Setting the current values in a new test or production environment after importing a solution.
- Checking which variables still run on their default value.
- Fixing a mistyped JSON or Key Vault reference before a flow picks it up.
- Adding a new variable to your solution without leaving your desktop tools.
