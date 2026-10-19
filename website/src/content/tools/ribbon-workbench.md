---
seoTitle: "Dataverse Ribbon Editor: Edit Classic Command Bars | PowerTools"
seoDescription: "Edit the classic Dataverse command bar of the tables in an unmanaged solution: add or hide buttons, change commands and their rules, check them, and publish."
xrmToolBoxEquivalent: "Ribbon Workbench"
features:
  - See a table's command bar as a tree for the form, home grid, or subgrid
  - Add buttons, flyouts, split buttons, menu sections, and groups
  - Hide built-in buttons, or copy a built-in command into the solution to change it
  - Edit commands, JavaScript and URL actions, and enable and display rules
  - Check for missing rules, duplicate ids, and missing web resources before publishing
  - Publish only the changed tables, with progress and import errors shown in the tab
---

## Change the classic command bar without hand-editing XML

Dataverse keeps a table's classic command bar customizations in the RibbonDiffXml of a solution. Ribbon Editor reads that definition from an unmanaged solution and shows it next to the published command bar, so you can see what the solution adds, hides, or overrides. Pick a solution, load it, and choose the application ribbon or one of the solution's tables.

The command bar is shown as a tree of tabs, groups, and controls for the form, home grid, or subgrid. Items the solution adds are marked, and so are built-in items it hides or whose command it changes. Commands, enable rules, display rules, and labels each have their own list, with an option to include the built-in ones.

## Edit with forms, then check

Add a button, flyout, split button, or group from the menu on any item, and edit its label, tooltip, command, sequence, and images in the details pane. New ids start with the solution publisher's prefix. A command holds its JavaScript or URL actions, their parameters, and the enable and display rules it uses. Rules are built from steps, including OR groups, and each step's fields follow the ribbon schema.

**Validate** checks the changed tables against the published command bar and the application ribbon. It reports rules or commands that are not defined, ids used twice, ids without the publisher prefix, and web resources that do not exist.

## Publish

Publishing exports the solution again, stops if someone changed the same command bar since you loaded it, writes your changes into the solution, imports it, and publishes only the changed tables. Progress shows in the tab and in the status bar. If the import fails, the reasons from Dataverse are shown and your edits stay so you can fix them. Nothing is installed in your environment.

## When to use it

- Adding a button that calls a JavaScript function to a table's form or home grid.
- Hiding a built-in button for one table.
- Changing when a built-in button shows by copying its command and giving it your own rules.
- Reviewing which commands and rules a solution changes before you ship it.
