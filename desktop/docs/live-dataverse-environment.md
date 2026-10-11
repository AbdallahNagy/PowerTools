# Live Dataverse environment

The tool-building pipeline checks new tools against a real Dataverse environment when one is configured. Unit tests still use fakes and never need credentials. The live check is an extra step on top of them.

`scripts/dataverse-live.mjs` does the work. It gets a token with the Entra client credentials flow, then either reads the Dataverse Web API or calls the local sidecar with the same headers the desktop app sends (`Authorization`, `X-Environment-Url`, `X-Local-Secret`). It never prints the token, the client secret, or the sidecar secret.

## Use a non-production environment

Point this only at a dedicated developer or sandbox environment that holds test data. Agents create, update, and delete records there. Never use a production environment or a production identity.

## One-time setup

1. **Environment.** Create a Developer or Sandbox environment with a Dataverse database in the Power Platform admin center. Note its URL, for example `https://contoso-dev.crm.dynamics.com`.
2. **App registration.** In Microsoft Entra ID, register an application. Create a client secret. Note the tenant ID, the application (client) ID, and the secret. No API permissions are needed for Dataverse with client credentials.
3. **Application user.** In the Power Platform admin center, open the environment, then **Settings > Users + permissions > Application users > New app user**. Add the app registration and give it **System Administrator** in that environment only. Tools such as plugin registration and solution moves need system-level privileges; a narrower role makes live checks fail on privileges rather than on bugs.
4. **Variables.** Provide these to whoever runs the pipeline:

   | Variable | Value |
   | --- | --- |
   | `DATAVERSE_URL` | Environment URL, `https://<org>.crm.dynamics.com` |
   | `DATAVERSE_TENANT_ID` | Entra tenant ID |
   | `DATAVERSE_CLIENT_ID` | Application (client) ID |
   | `DATAVERSE_CLIENT_SECRET` | Client secret value |
   | `DATAVERSE_AUTHORITY_HOST` | Optional. Defaults to `https://login.microsoftonline.com`. Set it for sovereign clouds. |

   - **Claude Code cloud sessions:** open the environment menu in the session title bar, choose **Edit**, and add the four variables as environment variables (or network secrets, where offered). Under **Network access**, allow `login.microsoftonline.com` and your environment's host (or `*.dynamics.com`), and keep package managers allowed so the .NET SDK can install. Start a new session to pick up the change.
   - **Local Claude Code or Cursor:** export the variables in the shell that starts the editor. Do not commit them.

5. **.NET.** The sidecar needs the .NET 9 SDK or newer. In Claude Code cloud sessions, the `SessionStart` hook runs `scripts/ensure-dotnet.sh`, which installs `dotnet-sdk-10.0` from the Ubuntu archive when `dotnet` is missing. The script runs the net9.0 sidecar on the newer runtime with `DOTNET_ROLL_FORWARD=Major`.

Confirm the setup:

```sh
node scripts/dataverse-live.mjs check
```

It prints the environment URL, organization, version, and calling user. Exit code `0` means connected, `2` means not configured, and `1` means configured but failing (bad secret, missing application user, or a blocked host).

## Commands

```sh
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

- Run `check` first. If it exits `2`, write that the live environment was not configured. If it exits `1`, record the error line. Never stand in mocked results for a live check.
- Name every record, solution, step, or component an agent creates with the prefix `PT Live Check` and the tool id, for example `PT Live Check attribute-explorer 2026-10-11`. Delete what you created before you finish, and record any cleanup that failed.
- Do not change organization settings, delete or modify anything you did not create, import managed solutions, or publish customizations other than the ones the check created.
- Do not paste tokens, secrets, or `Authorization` headers into the brief, the pull request, or any log you commit.
- Record each live call in the brief with the method, route, a short input description, the HTTP status, and what the response showed.
