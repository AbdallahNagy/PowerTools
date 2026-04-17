# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PowerTools is a modern Electron + React desktop app targeting Microsoft Dynamics 365 / Dataverse — a replacement for XrmToolBox. It pairs with a local ASP.NET Core API that proxies all Dataverse SDK calls.

## Project Layout

```
PowerTools/
  desktop/        ← Electron + React (Vite, TypeScript, Tailwind)
  api/PowerTools/ ← ASP.NET Core 8 minimal-API backend
```

Both must run simultaneously during development.

## Commands

### Desktop (run from `desktop/`)
```bash
npm install
npm run dev          # starts Vite (port 5123) + Electron concurrently
npm run lint         # ESLint
npm run build        # tsc + Vite build (outputs to dist-react/)
npm run transpile:electron  # tsc for Electron main process only
npm run dist:win     # package Windows installer
```

### API (run from `api/PowerTools/`)
```bash
dotnet run --project PowerTools.API   # HTTPS on port 7258
dotnet build
```

## Architecture

### Electron ↔ React (IPC boundary)

- **`src/electron/main.ts`** — main process. Manages named `StoredConnection` records (in-memory map). Handles all IPC: `create-connection-window`, `save-connection-data`, `save-connection-name`, `get-connection`, `get-active-connection`, `refresh-token`, `set-active-connection`, `list-connections`.
- **`src/electron/preload.cts`** — exposes `window.electron` API via `contextBridge`. Any new IPC channel must be registered here.
- **`src/electron/auth.ts`** — MSAL `PublicClientApplication` for Azure AD interactive + silent token acquisition. Tokens are cached in main process memory on the `StoredConnection` object, never in the renderer.

### Renderer (React)

- **`src/ui/api/client.ts`** — Axios instance pointing at `https://localhost:7258`. Two interceptors: (1) request interceptor fetches the active connection token via `window.electron` and sets `Authorization: Bearer` + `X-Environment-Url`; (2) response interceptor retries once on 401 with a refreshed token. For cross-environment operations (Data Migration), pass `config.meta.targetConnectionName` to include `X-Target-Authorization` + `X-Target-Environment-Url` headers.
- **`src/ui/context/TabContext.tsx`** — Tab state. Tools open as tabs via `addTab()` from the activity bar.
- **`src/ui/components/layout/`** — VS Code-style shell: `ActivityBar` (left icon strip), `TabBar` (tab header + content area), `StatusBar` (bottom, shows active connection).
- Tools live under **`src/ui/components/tools/`**. Currently: `DataMigration/` (multi-step wizard with `Stepper` + step components).
- Custom hooks in **`src/ui/api/hooks/`** wrap React Query calls to the backend (`useEntities`, `useEntityAttributes`, `usePreviewRecords`, `useMigrationJob`).

### API (ASP.NET Core)

- **`Program.cs`** — JWT bearer auth (multi-tenant AAD), CORS open for Electron, DI setup, endpoint group registration.
- **Endpoint groups** (`Tools/`) — one file per feature group, registered as `app.Map*Endpoints()`. Currently: `ConnectionEndpoints`, `DataMigration/MetadataEndpoints`, `DataMigration/PreviewEndpoints`, `DataMigration/MigrationEndpoints`.
- **Filters** — `DataverseContextFilter` extracts `Authorization`/`X-Environment-Url` from headers and stashes them on `HttpContext.Items`. `DataverseTargetContextFilter` does the same for `X-Target-Authorization`/`X-Target-Environment-Url`. Use `ctx.CreateDataverseClient(factory)` / `ctx.CreateTargetDataverseClient(factory)` in handlers (auto-disposes).
- **`Services/MigrationJobRunner`** — `BackgroundService` that drains a queue from `IMigrationJobStore`. Runs paged FetchXML against source, writes to target via `ExecuteMultipleRequest` (batch 100), tracks progress/errors on `MigrationJob`.

## Key Conventions

- API base URL is hardcoded to `https://localhost:7258` in `client.ts`. The API uses a self-signed cert in development — Electron skips cert validation by default.
- Connections are **in-memory only** in the main process; they are lost on app restart.
- New tools: add an icon button in `ActivityBar.tsx`, register a tab via `addTab()`, create a component under `src/ui/components/tools/`, add API endpoints in a new file under `api/.../Tools/` and register in `Program.cs`.
- Multi-environment operations (like Data Migration) require **two** connections: source (active) and target (named). Pass `meta: { targetConnectionName }` on the Axios request config.
