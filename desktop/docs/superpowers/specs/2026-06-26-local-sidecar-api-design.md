# Local Sidecar API — Migrate Hosted .NET API to Bundled Loopback Process

**Date:** 2026-06-26
**Status:** Approved design, pending implementation

## Goal

Stop hosting `PowerTools.API`. Ship it inside the Electron app as a self-contained executable that runs only on the user's machine and only on `127.0.0.1`. The user's MSAL token and Dataverse traffic never leave the device. Endpoint code, React code, and the Dataverse SDK usage stay unchanged.

Secondary goal: leave the door open for a v2 "extension workspace" model (third-party tools loaded into the same sidecar, à la VS Code extensions) without locking the design in now.

## Why a sidecar

The API is already stateless: every request carries its own access token and environment URL. There is no server-side session, no shared cache, no central database. The Dataverse SDK (`Microsoft.PowerPlatform.Dataverse.Client`) has no first-class JS equivalent. Re-writing endpoints in Node would throw away working code; hosting them in the cloud is what users are anxious about. Bundling the existing minimal API as a child process keeps the C# investment and collapses the trust boundary down to "the binary you already trust enough to install."

Alternatives considered and rejected:

- **Re-implement endpoints in TypeScript against the Web API directly.** High effort, loses the SDK's batching/upsert/messages, no v2 benefit.
- **Edge.js / CoreCLR in-proc hosting.** Abandoned ecosystem, fragile across Electron upgrades.
- **WebView2 + .NET MAUI hybrid.** Full architectural pivot for no incremental win.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron app (signed)                                           │
│                                                                 │
│  ┌──────────────┐    spawn(argv: port, secret)                  │
│  │  main (Node) │ ───────────────────────────┐                  │
│  │              │                            ▼                  │
│  │  sidecar.ts  │                  ┌──────────────────────┐     │
│  │              │  stdout:         │ PowerTools.API.exe   │     │
│  │              │ ◀── "LISTENING"  │ (self-contained .NET)│     │
│  │              │                  │ binds 127.0.0.1:port │     │
│  └──────┬───────┘                  └──────────┬───────────┘     │
│         │ getApiBaseUrl() + secret via preload│                 │
│         ▼                                     │                 │
│  ┌──────────────┐  http://127.0.0.1:<port>    │                 │
│  │  renderer    │  X-Local-Secret: <hex>      │                 │
│  │  (React)     │ ────────────────────────────┘                 │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (the only outbound hop)
                  https://<env>.crm.dynamics.com
```

Trust boundary: the per-launch shared secret protects the loopback port from other local processes on the machine. No traffic ever reaches a PowerTools-controlled server.

## Components

### `api/PowerTools/PowerTools.API`

Changes are surgical. No endpoint files are touched.

- **`Program.cs`**
  - Read `port` and `localSecret` from `args[0]` / `args[1]`. Fail fast if missing.
  - `builder.WebHost.UseUrls($"http://127.0.0.1:{port}")`.
  - Remove `AddAuthentication` / `AddJwtBearer` / `AddAuthorization` and the corresponding `UseAuthentication`/`UseAuthorization` middleware. Remove `UseHttpsRedirection`. **Keep `AddCors` / `UseCors`** with a permissive policy (`SetIsOriginAllowed(_ => true)`) — the renderer's origin (`http://localhost:5123` in dev, `file://` in prod) differs from the sidecar's, so browsers send a preflight `OPTIONS` that must be answered before the secret middleware runs. CORS is safe to leave wide-open here because the loopback bind plus per-launch secret are the real authorization boundary.
  - Add a tiny middleware that 401s any request missing or mismatching `X-Local-Secret`.
  - Emit `Console.WriteLine($"LISTENING {port}")` after `app.Start()` (use the explicit start pattern so the line is printed only when the kestrel server is bound), then `app.WaitForShutdown()`.
- **`PowerTools.API.csproj`**
  - Drop `Microsoft.Identity.Web` reference.
  - Drop `Microsoft.AspNetCore.OpenApi` (the OpenAPI surface is no longer needed once we are talking to ourselves; remove the `MapOpenApi` call too).
  - Add publishing properties: `PublishSingleFile=true`, `SelfContained=true`, `IncludeNativeLibrariesForSelfExtract=true`, `InvariantGlobalization=true`, `EnableCompressionInSingleFile=true`. Do **not** enable trimming — the Dataverse SDK is not trim-safe.
- **`DataverseContextFilter.cs` / `DataverseTargetContextFilter.cs`** — unchanged behaviour, but the filter group registration in `Program.cs` no longer calls `.RequireAuthorization()`. The per-request token still arrives in the `Authorization` header from the renderer and is still forwarded to Dataverse. That stays.
- **v2 prep:** introduce `ICurrentConnection` (scoped service) that reads token + env URL out of `HttpContext.Items` and exposes `CreateClient()`. Existing endpoints keep using the extension method; new/third-party endpoints in v2 resolve `ICurrentConnection` from DI without knowing header names. One-hour refactor, zero behaviour change.

### `desktop/src/electron`

New file `sidecar.ts`:

```
┌────────────────────────────────────────────────────────────────┐
│ start()                                                         │
│   1. port = await pickFreePort()       // net.createServer(0)   │
│   2. secret = crypto.randomBytes(32).toString('hex')            │
│   3. bin = resolveBinaryPath()                                  │
│   4. child = spawn(bin, [port, secret], { stdio: pipe })        │
│   5. await waitForReadyLine(child, /^LISTENING /)               │
│   6. return { baseUrl: `http://127.0.0.1:${port}`, secret }     │
│                                                                 │
│ stop()                                                          │
│   - child.kill('SIGTERM'); after 3s force kill (tree-kill on Win)│
└────────────────────────────────────────────────────────────────┘
```

`resolveBinaryPath()`:
- **Dev:** spawn `dotnet` with args `['run', '--project', '<repo>/api/PowerTools/PowerTools.API', '--no-launch-profile', '--', port, secret]`. No publish step needed during inner-loop development.
- **Prod:** spawn `path.join(process.resourcesPath, 'api', sidecarExeName())` where `sidecarExeName()` returns `PowerTools.API.exe` on Windows and `PowerTools.API` elsewhere.

`main.ts` wires it in:
- `await sidecar.start()` before creating the main `BrowserWindow`.
- Cache `baseUrl` / `secret` in module scope; expose via two new IPC handlers `get-api-base-url` and `get-local-secret` (one-shot, returned by promise).
- `app.on('before-quit', sidecar.stop)` and a `process.on('exit', sidecar.stop)` fallback.
- If `sidecar.start()` rejects, show a native error dialog and quit — the app is unusable without it.

`preload.cts` (the existing typed bridge):
- Add `getApiBaseUrl(): Promise<string>` and `getLocalSecret(): Promise<string>` to the `window.electron` surface.

### `desktop/src/ui/api/client.ts`

- Replace the hardcoded `const API_BASE_URL = "https://localhost:7258"` with a lazy initializer:
  ```ts
  let baseUrlPromise: Promise<string> | null = null;
  function getBaseUrl() {
    return baseUrlPromise ??= window.electron.getApiBaseUrl();
  }
  ```
  Build the `axios` instance lazily, or set `config.baseURL` inside the request interceptor.
- Add `X-Local-Secret` header in the request interceptor (cached once, same pattern).
- Everything else — token caching, 401 retry, `apiGet/apiPost/apiPut` — is untouched.

### Packaging

`electron-builder.json` gains:

```json
"extraResources": [
  { "from": "../api/PowerTools/PowerTools.API/bin/Release/net9.0/${arch}/publish", "to": "api" }
]
```

`package.json` `dist:*` scripts gain a `publish:api:<rid>` step that runs `dotnet publish -c Release -r <rid>` before `electron-builder`. One script per target RID (see below).

The bundled exe is signed as part of the existing code-signing step so SmartScreen / Gatekeeper do not flag the nested binary.

## Wire contract (today)

Request from renderer to sidecar:

```
GET /api/connect HTTP/1.1
Host: 127.0.0.1:<port>
X-Local-Secret: <32-byte hex>
Authorization: Bearer <Dataverse access token from MSAL>
X-Environment-Url: https://<env>.crm.dynamics.com
```

Two-environment endpoints (data migration) keep the existing `X-Target-Authorization` / `X-Target-Environment-Url` pair. No change to any tool endpoint.

## Lifecycle & error handling

- **Startup race:** `sidecar.start()` resolves only after the `LISTENING <port>` line; no port polling, no fixed-delay sleeps.
- **Crash during run:** child `exit` event triggers a renderer event `sidecar-down`, which the UI can surface as a toast. A "restart sidecar" command in the existing menu calls `sidecar.stop()` then `sidecar.start()` and rebroadcasts the new base URL. Stretch goal — not required for v1.
- **Port already in use:** impossible, we always pick a free port via OS assignment.
- **Antivirus false positive on the bundled exe:** mitigated by code signing and by shipping the published output unchanged (no UPX, no obfuscation).

## Cross-platform answer

Yes, this is still cross-platform. .NET 9 self-contained single-file publish targets a **Runtime Identifier (RID)**: an OS + CPU pair such as `win-x64`, `win-arm64`, `osx-x64`, `osx-arm64`, `linux-x64`, `linux-arm64`. Each RID produces one binary that runs without any installed .NET runtime on that exact OS+arch. The Electron app then has one installer per OS+arch download (which is already what `electron-builder` produces).

"Single binary per OS, or one per OS+arch?" — that question is whether to publish, say, only `win-x64` (and let Windows ARM users run it under x64 emulation) or both `win-x64` and `win-arm64`. Recommendation for v1: ship one RID per OS family — `win-x64`, `osx-arm64`, `linux-x64`. Add `win-arm64` and `osx-x64` later only if real users ask. Each `dist:*` script in `package.json` corresponds to one RID.

## Dev vs prod mode

Best practice and what we'll do:

- **Dev (`npm run dev`):** sidecar is spawned via `dotnet run --project ../api/...`. Pros — no publish step in the inner loop, breakpoints work from Rider/VS, edit-rebuild-relaunch is fast. Cons — requires the .NET 9 SDK on contributors' machines, which is already a given for anyone touching the C# project.
- **Prod (`electron-builder` output):** the published single-file self-contained exe is bundled inside `resources/api/`. End users do **not** need any .NET runtime installed. This is the whole point of `SelfContained=true`.

The same `sidecar.ts` handles both paths via the existing `isDev()` check; no second module, no duplicated lifecycle code.

## Security model (the marketing story)

After this change, the README can truthfully state:

> PowerTools never sees your data or your credentials. The application speaks to your Dataverse environment directly from your machine; no traffic is routed through any PowerTools-hosted service. Your MSAL token cache is stored encrypted in your OS keychain (DPAPI on Windows, Keychain on macOS).

Verifiable claims:

- The sidecar binds `127.0.0.1` only. No firewall prompt on first launch. Nothing on the LAN can reach it.
- Other processes on the same machine cannot call the sidecar without the per-launch random 32-byte secret.
- HTTPS is intentionally absent on the loopback hop. There is no MITM threat surface on `127.0.0.1`; adding TLS would only require shipping a dev cert or generating one at runtime, both of which are worse than nothing.
- JWT validation against Microsoft is **removed**. It added zero security on a loopback process (any caller that has the secret already has the token they are about to forward) while adding ~6 MB to the binary via `Microsoft.Identity.Web` and its transitive `IdentityModel` stack.

## v2 extension workspace (forward-compat, not built now)

Two decisions baked in today so v2 isn't a rewrite:

1. **Sidecar = future extension host.** Third-party tools in v2 will be additional endpoint groups loaded into this same process via `AssemblyLoadContext`. The wire contract stays HTTP/JSON over loopback; nothing about the v1 contract precludes this.
2. **`ICurrentConnection` scoped service** (introduced as part of v1, see above) is the public seam plugin code will resolve from DI. The header-parsing filter stays an internal implementation detail.

Explicitly out of scope for v1: the plugin loader itself, sandboxing, a manifest format, versioning, marketplace.

## Order of work

1. Add publish properties and the `--`-arg startup in `Program.cs`. Verify `dotnet publish -c Release -r win-x64` produces a runnable single exe that prints `LISTENING <port>` and responds on `/api/connect` with `X-Local-Secret`.
2. Strip JWT, HTTPS redirect, CORS, OpenAPI, `Microsoft.Identity.Web`.
3. Refactor `DataverseContextFilter` → `ICurrentConnection` scoped service. Endpoints unchanged.
4. Add `sidecar.ts` in `desktop/src/electron`, wire into `main.ts` lifecycle.
5. Add `getApiBaseUrl` / `getLocalSecret` to `preload.cts` and to the `window.electron` typings.
6. Update `client.ts` to use the dynamic base URL and the new header. Delete the hardcoded `https://localhost:7258`.
7. Update `electron-builder.json` `extraResources` and `package.json` `dist:*` scripts to publish the API before packaging.
8. Update `README.md` with the new architecture and security story.

## Out of scope

- Live-reload of the C# project under Electron (`dotnet watch` breaks the stdout handshake; revisit later).
- Removing the `axios` layer in favour of `fetch` (orthogonal cleanup).
- Auto-update of the sidecar separately from the Electron app (they ship together).
- A plugin loader, plugin manifest, plugin marketplace (all v2).
