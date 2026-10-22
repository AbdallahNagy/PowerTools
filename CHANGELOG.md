# Changelog

All notable changes to the Power Tools desktop app are recorded in this file. The local API ships inside the app, so its user-visible changes are listed here too.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each release section becomes the GitHub release notes and the notes in the in-app update dialog. See [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Added

- **Data Migration: several targets.** Add more than one target environment, such as QC, UAT, and production. After each migration, Data Migration shows where the data went, and the main button moves on to the next target with the same table, columns, filter, and options. Each target shows whether it is migrated, has errors, or is still to do, and you can migrate any target again.

### Changed

- Table, column, message, and user pickers filter as you type. Type any words from the display name or logical name, in any order, to narrow the list. This applies to the table, field, and choice value pickers in **FetchXML Builder**, the message, entity, and impersonating user pickers when registering a plugin step, and the table picker in **Solution Layers Explorer**.

## [1.1.0] - 2026-10-20

### Added

- **Solution Layers Explorer.** See every solution layer of a Dataverse component, compare any two layers side by side, and remove the unmanaged Active layer.
- FetchXML Builder: choose the columns to return, add or remove a column from the results grid, and start from any system or personal view of the table: its columns and its filters load into the builder, where you can edit them.
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

[Unreleased]: https://github.com/AbdallahNagy/PowerTools/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/AbdallahNagy/PowerTools/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/AbdallahNagy/PowerTools/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.5...v1.0.0
[0.1.0-beta.5]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.4...v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/AbdallahNagy/PowerTools/compare/v0.1.0-beta.0...v0.1.0-beta.1
[0.1.0-beta.0]: https://github.com/AbdallahNagy/PowerTools/releases/tag/v0.1.0-beta.0
