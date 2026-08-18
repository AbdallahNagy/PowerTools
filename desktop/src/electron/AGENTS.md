# Electron main-process rules

- Keep `main.ts` limited to application composition and lifecycle.
- Put connections, windows, sidecar, updates, storage, and external links in focused services.
- Group IPC registration by capability and delegate work to injected services.
- Validate IPC senders and inputs before privileged operations.
- Expose one typed preload method per operation; never expose raw `ipcRenderer`.
- Keep credentials, tokens, and secrets out of the renderer.
- Preserve existing IPC channel names and result shapes during behavior-preserving refactors.
- Unit-test services and handlers with fakes; keep real Electron coverage in the Windows smoke suite.
- Treat these as target boundaries; extract existing code only in the approved migration phase.
