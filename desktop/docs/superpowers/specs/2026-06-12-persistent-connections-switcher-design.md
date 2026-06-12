# Persistent Connections + StatusBar Switcher — Design

Date: 2026-06-12

## Goal

Let users keep their Dataverse connections across app restarts and switch
between them (and delete them) directly from the blue StatusBar at the bottom
left. Today connections live only in main-process memory and are lost on
restart; the MSAL token cache is also in-memory, so even persisted metadata
would force a fresh interactive login on every restart.

Success criteria:

- Connections added previously reappear automatically after restarting the app.
- The previously active connection is restored and usable with **zero clicks**
  (silent token acquisition succeeds; no browser login until the refresh token
  truly expires).
- User can switch the active connection from the StatusBar.
- User can delete a connection; it is removed from persistent storage and its
  token cache entry is purged.

## Scope

- Electron main process: add persistence for connection metadata and the MSAL
  token cache; add a `delete-connection` IPC channel.
- Renderer: rework `StatusBar.tsx` into a connection switcher with a click-up
  popover.
- **No API / backend (ASP.NET) changes.**
- No new IPC channels except `delete-connection` (all others already exist).

## Part 1 — Persistence (Electron main)

### New file `src/electron/storage.ts`

- Storage path: `path.join(app.getPath('userData'), 'connections.json')`.
- Persisted shape:

  ```ts
  interface PersistedState {
    connections: {
      name: string;
      envUrl: string;
      crmType: string;
      homeAccountId: string | null;
    }[];
    activeConnectionName: string | null;
  }
  ```

- Exports `loadState(): PersistedState` (returns empty default if file missing
  or unparseable) and `saveState(state: PersistedState): void`.
- Plain JSON — contains no secrets. `homeAccountId` is a benign MSAL account
  identifier; the actual refresh tokens live in the encrypted MSAL cache.

### `auth.ts` — persist the MSAL token cache

This is the piece that makes silent token acquisition work after a restart.

- Add a `cache: { cachePlugin }` to the `PublicClientApplication` config.
- Cache file path: `path.join(app.getPath('userData'), 'msal-cache.bin')`.
- `cachePlugin.beforeCacheAccess(ctx)`: if the cache file exists, read it,
  decrypt with Electron `safeStorage.decryptString`, then
  `ctx.tokenCache.deserialize(data)`.
- `cachePlugin.afterCacheAccess(ctx)`: if `ctx.cacheHasChanged`, take
  `ctx.tokenCache.serialize()`, encrypt with `safeStorage.encryptString`, and
  write the file.
- Encryption availability: on Windows DPAPI is always available. If
  `safeStorage.isEncryptionAvailable()` returns false, fall back to writing the
  serialized cache as plaintext (dev fallback) and read it back accordingly
  (detect by attempting decrypt / a small marker).
- New export `getAccountByHomeId(homeAccountId: string)` →
  `pca.getTokenCache().getAccountByHomeId(homeAccountId)`.
- New export `removeAccount(account)` → `pca.getTokenCache().removeAccount(account)`.

`safeStorage` requires the app to be ready; the PCA is created lazily on first
use, which is always after `app.whenReady`, so this is safe.

### `main.ts` changes

- `StoredConnection` gains `homeAccountId: string | null`.
- On `app.whenReady`: call `loadState()`, rebuild the `connections` map (with
  `account: null` — the account is lazily restored from the MSAL cache when the
  connection is first used), and restore `activeConnectionName`.
- `save-connection-name`: set `homeAccountId = account?.homeAccountId ?? null`
  on the stored connection, then `saveState()`.
- `set-active-connection`: call `saveState()` after updating active name.
- `getConnectionForRenderer(name)`: if `conn.account` is null but
  `conn.homeAccountId` is set, call `getAccountByHomeId()` to restore the
  account before calling `acquireTokenSilentOrInteractive`. After acquisition,
  persist the (possibly refreshed) `homeAccountId` and `saveState()`.

### New IPC `delete-connection`

- preload: expose `deleteConnection(name)` →
  `ipcRenderer.invoke('delete-connection', name)`.
- main handler:
  1. If the connection has a `homeAccountId`, resolve the account via
     `getAccountByHomeId` and call `removeAccount(account)` to purge its refresh
     token (this triggers a cache write via `afterCacheAccess`).
  2. Delete the entry from the `connections` map.
  3. If the deleted connection was active: set `activeConnectionName` to the
     first remaining connection, or `null` if none remain. Emit
     `connection-status-update` with the new active name (or signal
     disconnected).
  4. `saveState()` and emit `connections-updated` with the new list.

## Part 2 — StatusBar switcher (renderer)

Rework `src/ui/components/layout/StatusBar.tsx`.

State: `connections`, `activeName`, `open` (popover), and per-row
`confirmingDelete` (the name pending inline delete confirm, or null).

On mount:

- `listConnections()` to seed the list.
- `getActiveConnection()` to seed the active name (fixes the current
  blank-until-event behavior on reload). Only update the name on success; on
  error, fall back to the event-driven name so a token-refresh failure does not
  blank the bar.
- Subscribe `onConnectionsUpdated` → update list.
- Subscribe `onConnectionStatusUpdate` → update active name.

UI:

- Left button shows `Connected: (name)` or `Not Connected`; clickable.
- Click toggles a popover anchored **above** the button (`absolute bottom-full`).
- Rows = connections. Active row gets a ✓ and a highlight. Click a row →
  `setActiveConnection(name)`, close popover.
- Each row has a trash icon on the right (hover-reveal). Click → row swaps to an
  inline `Delete? Yes / No` confirm. `Yes` → `deleteConnection(name)`; `No` →
  revert. Click stops propagation so it never triggers row selection.
- Bottom row `+ Add connection` → `createConnectionWindow()`, close popover.
- Click-outside closes the popover (overlay or document mousedown listener).

Edge cases:

- Empty list → popover shows only `+ Add connection`.
- Deleting the active connection → main switches active to first remaining or
  null; the emitted `connection-status-update` / `connections-updated` events
  refresh the bar.

## Flow after restart

App opens → main `loadState()` + MSAL cache loaded lazily → renderer mounts →
`listConnections()` shows the saved list, `getActiveConnection()` restores the
account via `homeAccountId` → silent token succeeds → connected with zero
clicks.

## Testing

- Add connection → restart app → connection still listed and active without
  re-login.
- Switch active connection → restart → the switched-to connection is active.
- Delete a non-active connection → gone from list and persists across restart.
- Delete the active connection → active falls back to another (or Not Connected
  if none) and persists.
- `safeStorage` unavailable → app still functions (plaintext cache fallback).
