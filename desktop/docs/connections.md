# Connections

A connection is one Dataverse environment the user signed in to. This page covers how connections are named, stored, imported, and opened in a browser.

## Naming

A connection has no free-text name. It is described by:

- **Organization**: free text, such as "Contoso". Connections are grouped by it.
- **Environment**: free text with presets (dev, qc, stg, prod). An organization can have several environments of one kind, such as "dev" and "dev 2". Picking a preset the organization already has fills in the next free number.

The app shows "Organization · Environment" everywhere. That pair is unique, ignoring case. `environmentKind()` in `src/ui/shared/connections/connectionNaming.ts` reads the kind from the first word ("Prod EU" is production). It is used to sort environments, to show the prod badge, and to give production tabs a red header.

Connections saved before organizations existed keep their old name as `legacyName` and appear under **Other** until the user sets an organization and environment.

## Identity and storage

Each connection has a hidden UUID `id`. Tabs, the API client (`meta.connectionId`), React Query keys, and the sidecar use it. The sidecar header is still called `X-Connection-Name` and carries the id. Editing a connection never changes its id.

`src/electron/connectionStore.ts` owns `connections.json` and migrates older files on first load. `src/electron/connectionIpc.ts` registers the connection IPC handlers.

## Browser and profile

A connection can name a browser and profile. `src/electron/browserProfiles.ts` finds installed browsers and reads their profiles. Edge, Chrome, and Brave keep profiles in `Local State` (`profile.info_cache`); the saved profile is the profile directory, such as `Profile 1`. Firefox keeps them in `profiles.ini`; the saved profile is the profile name.

| | Windows | macOS | Linux |
|---|---|---|---|
| Executable | App Paths registry key, Program Files, or `%LOCALAPPDATA%` | `/Applications` or `~/Applications` | `PATH` (`microsoft-edge`, `google-chrome`, `brave-browser`, `firefox`) |
| Chromium profiles | `%LOCALAPPDATA%\<browser>\User Data\Local State` | `~/Library/Application Support/<browser>/Local State` | `~/.config/<browser>/Local State` |
| Firefox profiles | `%APPDATA%\Mozilla\Firefox\profiles.ini` | `~/Library/Application Support/Firefox/profiles.ini` | `~/.mozilla/firefox/profiles.ini`, or the snap's copy under `~/snap/firefox` |

`src/electron/browserLauncher.ts` starts the browser with `--profile-directory=<dir>` (Chromium) or `-P <name> -new-tab` (Firefox). If the browser or profile is gone, it opens the system default browser and reports a fallback, which the renderer shows as a notice.

Tools open environment pages with `useOpenInBrowser()` from `src/ui/shared/connections`. It defaults to the tab's connection. `buildDynamicsRecordUrl` and `solutionEditorUrl` build record and solution URLs.

## Import and export

Export writes a `powertools-connections` JSON file without passwords, tokens, or account ids.

Import accepts that JSON or an XrmToolBox connections file (`<CrmConnections><Connections><ConnectionDetail>`, or one exported `<ConnectionDetail>`). From XrmToolBox it reads:

| XrmToolBox | Power Tools |
|---|---|
| `OrganizationFriendlyName` | Organization |
| `EnvironmentHighlightingInfo/Text` | Environment |
| `ConnectionName` | Old name, when organization or environment is missing |
| `OriginalUrl`, then `WebApplicationUrl`, then `OrganizationServiceUrl` | Environment address |
| `NewAuthType`, `AuthType`, `UseIfd` | Online, or on-premises AD or IFD |
| `UserName`, `UserDomain` | On-premises user and domain |
| `BrowserName`, `BrowserProfile` | Browser and profile |

Limits:

- Passwords are never imported. On-premises connections ask for theirs once in Manage connections. Online connections sign in on first use.
- Client secret, certificate, and external token sign-ins are listed as not supported and skipped.
- An environment that is already added (same address, and for on-premises the same user) is skipped.
- A connection whose organization and environment are taken, or missing, is imported under **Other**.
