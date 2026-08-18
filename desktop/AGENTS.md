# Desktop client rules

## Scope

- Windows is the production target.
- The desktop client includes the React renderer, preload bridge, Electron main process, sidecar lifecycle, packaging, and desktop tests.
- Refactors are behavior-preserving unless explicitly approved otherwise.

## Target boundaries

- `src/ui/tools/<tool>/`: private tool UI, model, API, state, and tests.
- `src/ui/shared/`: public contracts, hooks, services, and UI available to tools.
- `src/ui/platform/`: typed renderer access to desktop capabilities.
- `src/ui/shell/`: activity bar, tabs, status bar, and tool hosting.
- `src/electron/`: privileged desktop services, IPC, windows, and bootstrap.
- Define each shared data contract once.
- Tools may import public shared and platform APIs.
- Tools must not import another tool's private files or shell internals.
- Shared modules must not import tools.
- Renderer code must not call raw IPC or `window.electron` outside the platform adapter.
- Existing files may remain in legacy locations until their approved migration phase.
- Do not add new direct Electron access or cross-tool imports while legacy code is being migrated.

## Verification

- Add or update regression tests before changing behavior.
- Use deterministic API and desktop fakes; never use production credentials in automated tests.
- From `desktop/`, run `npm test`, `npm run lint`, and `npm run build` before completion.
- When `npm run check` exists, use it as the required aggregate gate.
