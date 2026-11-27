# Changelog

All notable changes to the Power Tools desktop app are recorded in this file. The local API ships inside the app, so its user-visible changes are listed here too.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each release section becomes the GitHub release notes and the notes in the in-app update dialog. See [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Added

- Community tools: load a tool from a local folder (File > Community tools).
- **Dark Orange theme.** A second dark theme with warm charcoal surfaces and an orange accent, based on Claude's dark mode. Pick it under View > Theme or Settings > Appearance.
- **Settings.** One place to manage the app. Open it from the gear at the bottom of the sidebar, File > Settings…, the command palette, or Ctrl+,. It has the theme, the MCP server with each of its tools listed and switchable one by one, the "changes without asking" switch for every connection, usage stats and crash reports, the version and update status, the data and agent activity folders, and the keyboard shortcuts. Sections are grouped in a side list with a search box, the theme is picked from previews, and each agent client (Claude Code, Claude Desktop, VS Code) shows its own setup.
- **Reorder tabs.** Drag a tab along the strip to move it, or press Ctrl+Shift+PageUp and Ctrl+Shift+PageDown to move the active tab. Each tab shows its tool's icon, a middle click closes a tab, and the arrow keys move between tabs when one has focus.
- **MCP server for AI agents.** An optional server (off by default; turn it on under Settings > Agents (MCP)) that lets agents such as Claude Code, Claude Desktop and VS Code work on your Dataverse environments with your own sign-in. It offers 25 tools that work the same on Dataverse online and on-premises. Agents read with `inspect_schema`, `inspect_ui` (forms, views, apps, site maps, commands, web resources), `inspect_solution` (solutions, layers, publishers, environment variables, connection references, plug-ins, Custom APIs, processes, flows) and `records_query`. They change things by sending the desired state to an apply tool: `table_apply`, `choice_apply`, `form_apply` (including whole layouts, form scripts and system dashboards), `view_apply`, `webresource_apply` (web resources from files or a folder), `app_apply` (model-driven apps with their site map, roles and, online, modern commands), `solution_apply`, `config_apply`, `plugin_deploy`, `plugin_step_apply`, `customapi_apply`, `role_apply` (security roles, who has them, and field security profiles), `flow_apply` (cloud flows with their connection references, online only; a guide explains the format), `process_apply` (classic workflows and custom process actions from typed steps such as update, create, send email, assign, conditions and child workflows, online and on-premises; a guide explains the format) and `records_write`; deletes go through `records_delete` (records) and `remove` (components), and `solution_export`, `solution_import` and `execute_message` cover the rest. Dyno plans each change first and only what differs runs, so sending the same spec again changes nothing. The approval dialog shows the planned steps in the order they run. Dyno decides what needs your approval, not the agent: reads run, changes ask unless you allow changes for that connection (Manage connections), and deletions and other destructive changes always ask. A feature an environment lacks, such as connection references on-premises, shows as an unsupported step that names what to do instead. Clients connect through a small command that the app sets up for them. You can switch each group of tools off (Read, Records, Record deletes, Schema, Apps, forms and views, Plug-ins, APIs and processes, Security, Solutions, Remove components) or each tool on its own. Settings sorts the tools into Read, Change and Destructive by the effect each one's description states, and a local activity log shows what agents did. See [the MCP server guide](desktop/docs/mcp-server.md).

### Changed

- **New look.** Dyno has a new logo, a ring with a lime piece that completes it, in the title bar, the window and taskbar icon and the installer. The accent color is now that lime in the Dark and Light themes: buttons, the status bar, selections and links. Switches stay blue (see Cleaner Settings). Dark Orange keeps its orange accent.
- **New welcome page.** The welcome tab now tells what Dyno does in two parts: modern tools for everyday Dataverse work, and the MCP server for working with an AI agent. It shows the new Dyno logo, whether the MCP server is running (with a button to turn it on), the setup command for Claude Code, Claude Desktop or VS Code on this computer, and how agent changes are approved. Clicking a tool on the welcome page now opens it, and every tool tile is the same size, with a short summary of the tool.
- **Cleaner Settings.** Every setting is now a plain row: its name, one line of explanation, and its control on the right, with thin lines between rows instead of cards. Agent tools and Agent activity drop the colored icon on each row; a small tag marks tools and calls that change or delete things. The sidebar separates its groups with thin lines, and a title bar runs across the top of the dialog. Switches everywhere in the app are now a plain blue in every theme. The theme previews in Appearance stay as they were.
- **Data Migration: select all fields from the table header.** A checkbox in the field table's header replaces the Select all and Select none links. It checks or clears every field shown (only the matching ones while searching) and shows a partial state when some are checked. The primary id stays selected.
- **Power Tools is now Dyno.** The app's name, title bar, shortcuts and messages say Dyno. Your connections, sign-ins and settings stay where they are: an install from before the rename keeps its `Power Tools` folders. Connection exports are now `dyno-connections` files, and exports from Power Tools still import. Community tools use a `dyno-tool.json` manifest. The MCP server is named `dyno` and its guides are `dyno://guides/…`. The local API and the MCP connector run as `Dyno.Api.exe` and `Dyno.McpConnector.exe`, and solutions that agents export go to `Documents\Dyno\Solutions`. The installer is now `Dyno-Setup.exe`, the website moved to [dyno.abdallahnagy.com](https://dyno.abdallahnagy.com/), and the GitHub repository is [AbdallahNagy/Dyno](https://github.com/AbdallahNagy/Dyno). Community tools build on `@dynoapp/sdk` and `@dynoapp/ui`.
- **Animated startup screen.** While Dyno starts, the new Dyno logo plays once: the ring draws itself, its green arc lands and it spins, then it settles in as the "o" of "dyno" while the other letters fade in. The app opens after the animation has played, even when startup is quick. If startup takes longer, the finished wordmark stays with a moving bar under "Starting local services". With reduced motion turned on in Windows, the finished logo shows right away and only the bar moves.
- **The sidebar collapses to icons.** Hiding the sidebar (Ctrl+B or the title bar button) now leaves a narrow strip with every tool's icon, the connection dot, and Settings. Point at an icon to see its name at once. The tool of the active tab is marked in the sidebar.

### Fixed

- An agent connected to Dyno never blocks app updates. Agents start a small connector that Dyno copies to `%LOCALAPPDATA%\Dyno\mcp`, outside the install folder.
- A tool opened right as Dyno starts gets the active connection. It could open with no connection if you clicked it in the moment the connection appeared in the sidebar.
- The minimize, maximize, and close buttons keep the normal arrow cursor instead of the hand.
- Opening a record or solution in the browser (for example from FetchXML Builder results) no longer stalls the first time. Dyno finds the installed browsers when it starts instead of on the first click, and shows "Opening in your browser…" right away.

## [1.3.0] - 2026-11-03

### Added

- **Environment Variables Manager.** A new tool that lists every environment variable in an environment with its type, default value, and current value. Edit current values in the list and save them together, with each value checked against its type first and each row marked as saved or failed. Create a variable, optionally in an unmanaged solution, with its schema name filled in from the display name and an optional current value. Update its display name, description, and default value, and delete a variable or only its current value. Values and definitions that came from a managed solution are marked, and cannot be deleted.
- **Solution Components Mover: search component types.** The component type list has a search box. The header checkbox selects or clears the types the search shows, and a count shows how many types are selected.
- **Solution Components Mover: From and To.** Before you confirm a copy, a diagram above the component type list connects each source solution, through a copy node, to each target solution the copy goes to.

### Changed

- **Solution Components Mover: targets clear after a copy.** When a copy finishes, the target solutions are cleared and the sources stay checked. Choose a target again for the next copy, so it no longer also goes to the previous target. A refused copy keeps your selection.
- **Solution Components Mover: Refresh solutions.** The refresh button shows its icon and label, spins while the list reloads, and confirms with **Solutions refreshed** when it finishes.

### Fixed

- **Plugin Registration: updating a custom workflow assembly.** Updating an assembly no longer fails with "Plug-in assembly fullnames must be unique (0x8004417B)". The update now sends the assembly's full identity with the new file, as the Microsoft Plug-in Registration Tool and XrmToolBox do. Workflow activities in the default "Name (version)" group move to the new version.
- **Plugin Registration: match the Microsoft and XrmToolBox tools.** New assemblies store the public key token in uppercase, steps link to their plug-in type through the current event handler column, and images can be added to ExecuteWorkflow and Route steps.
- **Data Migration: filters on related tables.** A filter can now include `<link-entity>` joins, entered on their own or as full FetchXML, as in XrmToolBox Data Transporter. Before, such a filter failed with “Request failed with status code 400”.
- **Solution Components Mover:** the component type list no longer shifts left and right while you scroll it.

## [1.2.0] - 2026-10-30

### Added

- **Data Migration: several targets.** Add more than one target environment, such as QC, UAT, and production. After each migration, Data Migration shows where the data went, and the main button moves on to the next target with the same table, columns, filter, and options. Each target shows whether it is migrated, has errors, or is still to do, and you can migrate any target again.
- **Data Migration: record count in Preview.** Preview shows how many records the migration will send and, across all of them, how many will be created and how many updated in the target you compare with.
- **Data Migration: Delete.** Tick **Delete** to remove target records that are not among the source records you migrate, as in XrmToolBox Data Transporter. The filter only chooses source records, so target records outside it are deleted too, even when the source has them. Turning it on explains what it does, and a warning stays visible while it is on. Before each target runs, Data Migration lists the records it will delete and asks you to confirm that number. The run deletes nothing if it then finds more records to delete than you confirmed, or if the source returns no records. Deletions happen last, so a run that fails earlier deletes nothing.
- **Data Migration: created and updated counts.** The status bar, the run banner, and each target's details show how many records were created and how many were updated.
- FetchXML Builder: choose the columns to return, add or remove a column from the results grid, and start from any system or personal view of the table: its columns and its filters load into the builder, where you can edit them.

### Changed

- **Data Migration: skip instead of fail.** With only **Create** on, records that already exist in the target are skipped. With only **Update** on, records that are not in the target are skipped. Preview shows these records as Skip, and the run reports how many were skipped.
- **Data Migration: simpler Preview.** Preview shows three columns: Action, ID, and Name. Action says whether each record will be created, updated, or skipped in the target you compare with.
- Resize table columns. Drag the right edge of a column header to make the column wider or narrower, and double-click the edge to put that column back to its automatic width. This applies to the tables in every tool, including the FetchXML Builder results grid and the Data Migration field list and preview.
- Table, column, message, and user pickers filter as you type. Type any words from the display name or logical name, in any order, to narrow the list. This applies to the table, field, and choice value pickers in **FetchXML Builder**, the message, entity, and impersonating user pickers when registering a plugin step, and the table picker in **Solution Layers Explorer**.

### Fixed

- **Data Migration: inactive records.** Creating a record that is inactive in the source no longer fails on its status reason. The record is created, then moved to its source status in the same transaction.

## [1.1.0] - 2026-10-20

### Added

- **Solution Layers Explorer.** See every solution layer of a Dataverse component, compare any two layers side by side, and remove the unmanaged Active layer.
- Close actions in the tab menu.
- Right-click a tool in the sidebar to open it with the active connection or pick another connection for the new tab.
- Crash reporting. Errors and crashes are reported so they can be fixed. Reports leave out request data, headers, and local variables. Turn it off from **Help > Send Crash Reports**.
- **Manage connections.** Edit a connection's organization, environment, browser, and profile from **File > Manage Connections…**, the connection menu, or the command palette.
- Each connection can open links in a chosen browser and profile (Edge, Chrome, Brave, or Firefox). Records and solutions that tools open use it.
- Import and export connections from **File**. Imports accept Power Tools exports and XrmToolBox connection files, show a preview first, and never include passwords.
- Connections in the command palette: switch connection, open the current environment in its browser, and manage, import, or export connections.
- Anonymous usage stats. Once a day the app sends a random install ID, the app version, the OS, and the CPU architecture, with no user names, connection details, or Dataverse data. Turn it off from **Help > Send Anonymous Usage Stats**.

### Changed

- Connections are named by organization and environment, such as "Contoso · Dev", and grouped by organization. The name is unique. Connections added before this version keep their name under **Other** until you add an organization and environment.
- Production environments show a red **prod** badge, and tabs working against production have a red header.
- Only the tab strip scrolls when many tabs are open, so the rest of the title bar stays in place.
- The status bar shows the status of the active tab's tool only.

## [1.0.1] - 2026-10-09

### Added

- **Translator.** Edit the display names and descriptions of tables, columns, choices, views, and charts side by side in every installed language. Load labels from a solution and add changes to a target solution.
- **Attribute Explorer.** Browse every table in an environment and inspect its fields, types, and lookups.
- **Bulk Workflow Execution.** Run an on-demand workflow against every record a view or FetchXML query returns, in batches you can pace and stop.

### Changed

- Updates are easier to spot. An **Update** button appears in the title bar, and a dialog shows the release notes with **Later** and **Update now**.
- Refreshed look with a teal accent, light and dark themes, IBM Plex type, and Lucide icons.
- Large tables scroll faster, and FetchXML is edited in a full code editor.
- New app icon.

## [1.0.0] - 2026-10-04

The first stable release.

### Added

- **FetchXML Tester.** Run FetchXML as written and keep a query library, in a split layout with a row count.
- **Plugin Registration.** Browse and manage plug-in assemblies, types, steps, and images.
- **Polymorphic Lookup Creator.** Create, update, and delete polymorphic lookups.
- **Solution Components Mover.** Copy solution components from selected solutions into unmanaged solutions in the same environment.
- **Workflow Activities Viewer.** See which activated processes reference a custom workflow activity.
- Each tool tab keeps its own connection.
- Keyboard shortcuts for tabs, quick open, and primary actions.
- A searchable tool sidebar and unified title-bar menus.
- Shortcuts in the empty workspace, and a prompt when every tool tab is closed.
- The welcome page and website list every current tool.

## [0.1.0-beta.5] - 2026-08-25

### Changed

- Enhancements and bug fixes.

## [0.1.0-beta.4] - 2026-08-09

No release notes were published for this build.

## [0.1.0-beta.3] - 2026-08-09

No release notes were published for this build.

## [0.1.0-beta.2] - 2026-08-09

No release notes were published for this build.

## [0.1.0-beta.1] - 2026-08-09

No release notes were published for this build.

## [0.1.0-beta.0] - 2026-08-02

The first public beta, built for Windows.

### Added

- A secure local connection flow for Dataverse.
- **Data Migration.** Move data between Dataverse environments with a guided workflow.
- **FetchXML Builder.** Build, run, and refine FetchXML queries.

[Unreleased]: https://github.com/AbdallahNagy/Dyno/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/AbdallahNagy/Dyno/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/AbdallahNagy/Dyno/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/AbdallahNagy/Dyno/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/AbdallahNagy/Dyno/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.5...v1.0.0
[0.1.0-beta.5]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.4...v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/AbdallahNagy/Dyno/compare/v0.1.0-beta.0...v0.1.0-beta.1
[0.1.0-beta.0]: https://github.com/AbdallahNagy/Dyno/releases/tag/v0.1.0-beta.0
