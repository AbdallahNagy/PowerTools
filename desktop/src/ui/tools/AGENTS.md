# Built-in tool module rules

- Each tool owns one folder and exports one typed manifest from `tool.ts`.
- Register a tool once in the central registry.
- Keep tool-specific components, models, API calls, state, fixtures, and tests private.
- Use shared contracts, UI, connections, API helpers, and desktop capabilities through public modules.
- Publish status-bar content through `useToolStatus`; never manage status IDs manually.
- Key connections by `id` and show `displayName` ("Organization · Environment"). Never show a connection id to the user.
- Open Dataverse pages, such as a record or a solution, with `useOpenInBrowser` from `shared/connections`. It uses the browser and profile the user chose for the connection. Keep `openExternalUrl` for pages that do not belong to an environment.
- Do not access raw Electron APIs, shell contexts, or another tool's internals.
- Promote code to `shared/` only when it is a shared domain contract or a proven reusable capability.
- Preserve visible behavior while migrating an existing tool.
- Activity-bar tools set `allowMultipleInstances: true` unless the brief says a second tab cannot work. Welcome stays a single tab.
- List each activity-bar tool once in `publicCatalog.ts`, in registry order. The welcome page and the website render that list. Do not add a second tool list on either screen. The README tool table is generated from the same list: after changing `publicCatalog.ts`, run `node scripts/sync-readme-tools.mjs` from the repository root.
- Give each activity-bar tool a website page at `website/src/content/tools/<tool-id>.md`. See "Website tool page" in the tool-building pipeline doc.
- When adding or designing a Dataverse tool, start with the `xrmtoolbox-plugin-researcher` subagent and follow the tool-building pipeline in [`desktop/docs/tool-building-pipeline.md`](../../../docs/tool-building-pipeline.md). Search [XrmToolBox plugins](https://www.xrmtoolbox.com/plugins/), read the matching plugin backend, and map that logic onto this Electron/React tool module plus sidecar endpoints before inventing Dataverse workflows. Save that research unchanged at `desktop/docs/tools/<tool-id>/brief.md`. `dataverse-expert` and `power-tools-ux` append their sections in parallel. `power-tools-developer` starts only after both Dataverse review and UX are written.
