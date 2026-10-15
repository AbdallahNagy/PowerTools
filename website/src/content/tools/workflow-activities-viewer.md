---
seoTitle: "Workflow Activities Viewer for Dataverse | PowerTools"
seoDescription: "Find every activated Dataverse process that uses a custom workflow activity. See its inputs, outputs, and each process's table and start conditions."
xrmToolBoxEquivalent: "Workflow Activities Viewer"
features:
  - List custom workflow activities grouped by assembly
  - Search activities by name
  - See each activity's input and output arguments
  - Find every activated process that uses the activity
  - See each process's category, table, and start conditions
  - Know when an activity is not used anywhere
---

## Know where a custom activity is used

Custom workflow activities are compiled code that classic workflows and other processes call. Before you change or remove one, you need to know which processes depend on it. Workflow Activities Viewer answers that question.

The tool lists the custom workflow activities in your environment, grouped by assembly, with a search box to find one by name.

## Activity details and dependent processes

Select an activity to see who created and last changed it, and its input and output arguments. Below that, every activated process that uses it is listed with its name, category, primary table, created and modified dates, and start conditions: on demand, on create, when named columns change, or on delete.

If no process uses the activity, the tool says so, which makes it easy to spot code you can retire.

## When to use it

- Checking the impact before you change a custom workflow activity.
- Finding unused activities to clean up.
- Documenting which processes depend on a plug-in assembly.

The tool is read-only. It does not change processes or assemblies.
