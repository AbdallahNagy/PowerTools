# Live Dataverse environment

The tool-building pipeline checks new tools against a real Dataverse environment when one is configured. Unit tests still use fakes and never need credentials. The live check is an extra step on top of them.

`scripts/dataverse-live.mjs` does the work. It signs in, then either reads the Dataverse Web API or calls the local sidecar with the same headers the desktop app sends (`Authorization`, `X-Environment-Url`, `X-Local-Secret`). It never prints the token, the client secret, or the sidecar secret.

## Use a non-production environment

Point this only at a developer or sandbox environment that holds test data. Agents create, update, and delete records there. Never use a production environment or a production identity.

## Sign in

There are two ways to sign in. Use option A unless you need unattended runs.

### Option A: your own account (no app registration)

This uses the same public Microsoft client ID the desktop app signs in with, so nobody has to register an app in Entra ID. Agents act as you, with your security roles in that environment.

```sh
node scripts/dataverse-live.mjs login start https://<org>.crm.dynamics.com
# Open the page it prints, enter the code, and sign in with your account.
node scripts/dataverse-live.mjs login finish
```

`login finish` waits until you finish signing in, then saves the token to `~/.powertools-live/user-token.json`, readable only by the current user. Later commands refresh it on their own. Run `logout` to remove it.

- In a Claude Code cloud session, the container is discarded when the session ends, so sign in once per session. `/build-tool` asks you for the environment URL and shows you the code when no sign-in is found.
- Some tenants block device code sign-in with Conditional Access. If `login finish` reports that, use option B or ask an admin to allow device code flow for your account.
- You need a security role in the environment that covers what the tool does. System Administrator or System Customizer is typical in a developer environment.

### Option B: app registration (unattended)

Use this when sessions must run without anyone signing in. It needs rights to register an app in Entra ID.

1. In Microsoft Entra ID, register an application and create a client secret.
2. In the Power Platform admin center, open the environment, then **Settings > Users + permissions > Application users > New app user**. Add the app and give it **System Administrator** in that environment only.
3. Set the variables:

   | Variable | Value |
   | --- | --- |
   | `DATAVERSE_URL` | Environment URL, `https://<org>.crm.dynamics.com` |
   | `DATAVERSE_TENANT_ID` | Entra tenant ID |
   | `DATAVERSE_CLIENT_ID` | Application (client) ID |
   | `DATAVERSE_CLIENT_SECRET` | Client secret value |

   In a Claude Code cloud session, add them in the environment settings (environment menu in the session title bar, then **Edit**). Locally, export them in the shell that starts the editor. Do not commit them.

When all four variables are set, the script uses option B. Otherwise it uses the saved sign-in from option A. `DATAVERSE_AUTHORITY_HOST` (default `https://login.microsoftonline.com`) is optional for sovereign clouds.

## Network and .NET

- **Network.** In a Claude Code cloud session, allow your environment's host (for example `contoso-dev.crm.dynamics.com`) under **Network access** in the environment settings, and keep package managers allowed. `login.microsoftonline.com` must also be reachable. The sign-in page itself opens in your own browser, not in the session.
- **.NET.** The sidecar needs the .NET 9 SDK or newer. In Claude Code cloud sessions, the `SessionStart` hook runs `scripts/ensure-dotnet.sh`, which installs `dotnet-sdk-10.0` from the Ubuntu archive when `dotnet` is missing. The script runs the net9.0 sidecar on the newer runtime with `DOTNET_ROLL_FORWARD=Major`.

Confirm the setup:

```sh
node scripts/dataverse-live.mjs check
```

It prints the environment URL, organization, version, calling user, and sign-in mode. Exit code `0` means connected, `2` means not signed in and not configured, and `1` means configured but failing (expired sign-in, bad secret, missing application user, or a blocked host).

## Commands

```sh
# Sign in as yourself, or remove the saved sign-in
node scripts/dataverse-live.mjs login start https://<org>.crm.dynamics.com
node scripts/dataverse-live.mjs login finish
node scripts/dataverse-live.mjs logout

# Connection check
node scripts/dataverse-live.mjs check [--json]

# Read-only Web API GET, relative to /api/data/v9.2/
node scripts/dataverse-live.mjs webapi "EntityDefinitions(LogicalName='account')?\$select=LogicalName,IsCustomizable"

# Build and start the sidecar on a free loopback port, then stop it
node scripts/dataverse-live.mjs sidecar start
node scripts/dataverse-live.mjs sidecar status
node scripts/dataverse-live.mjs sidecar stop

# Call a sidecar endpoint as the desktop app would
node scripts/dataverse-live.mjs call GET /api/connect
node scripts/dataverse-live.mjs call POST /api/<tool>/<route> --body '{"key":"value"}'
node scripts/dataverse-live.mjs call POST /api/<tool>/<route> --body-file request.json
```

`webapi` sends only `GET` requests. `call` uses the configured environment for both the source and, when a tool needs one, the target. Tools that need two different environments can be checked against the same environment where that still exercises the path; say so in the evidence.

## Rules for live checks

- Run `check` first. Subagents never start a sign-in; only the main session does, with the user. If it exits `2`, write that the live environment was not configured. If it exits `1`, record the error line. Never stand in mocked results for a live check.
- Name every record, solution, step, or component an agent creates with the prefix `PT Live Check` and the tool id, for example `PT Live Check attribute-explorer 2026-10-11`. Delete what you created before you finish, and record any cleanup that failed.
- Do not change organization settings, delete or modify anything you did not create, import managed solutions, or publish customizations other than the ones the check created.
- Do not paste tokens, secrets, sign-in codes, or `Authorization` headers into the brief, the pull request, or any log you commit.
- Record each live call in the brief with the method, route, a short input description, the HTTP status, and what the response showed.
