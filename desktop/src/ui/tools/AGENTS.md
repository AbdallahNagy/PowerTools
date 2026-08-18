# Built-in tool module rules

- Each tool owns one folder and exports one typed manifest from `tool.ts`.
- Register a tool once in the central registry.
- Keep tool-specific components, models, API calls, state, fixtures, and tests private.
- Use shared contracts, UI, connections, API helpers, and desktop capabilities through public modules.
- Publish status-bar content through `useToolStatus`; never manage status IDs manually.
- Do not access raw Electron APIs, shell contexts, or another tool's internals.
- Promote code to `shared/` only when it is a shared domain contract or a proven reusable capability.
- Preserve visible behavior while migrating an existing tool.
