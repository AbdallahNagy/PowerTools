# Built-in tool module rules

- Each tool owns one folder and exports one typed manifest from `tool.ts`.
- Register a tool once in the central registry.
- Keep tool-specific components, models, API calls, state, fixtures, and tests private.
- Use shared contracts, UI, connections, API helpers, and desktop capabilities through public modules.
- Publish status-bar content through `useToolStatus`; never manage status IDs manually.
- Do not access raw Electron APIs, shell contexts, or another tool's internals.
- Promote code to `shared/` only when it is a shared domain contract or a proven reusable capability.
- Preserve visible behavior while migrating an existing tool.
- Activity-bar tools set `allowMultipleInstances: true` unless the brief says a second tab cannot work. Welcome stays a single tab.
- When adding or designing a Dataverse tool, start with the `xrmtoolbox-plugin-researcher` subagent and follow the tool-building pipeline in [`desktop/docs/tool-building-pipeline.md`](../../../docs/tool-building-pipeline.md). Search [XrmToolBox plugins](https://www.xrmtoolbox.com/plugins/), read the matching plugin backend, and map that logic onto this Electron/React tool module plus sidecar endpoints before inventing Dataverse workflows. Save that research unchanged at `desktop/docs/tools/<tool-id>/brief.md`. `dataverse-expert` and `power-tools-ux` append their sections in parallel. `power-tools-developer` starts only after both Dataverse review and UX are written.
