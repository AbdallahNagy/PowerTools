# On-Premises Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Dynamics 365 on-premises connections while keeping existing online endpoint logic mostly unchanged.

**Architecture:** Move from "every request is an online bearer token" to a connection-context model. Electron stores named connection metadata and credentials, the renderer passes a connection name, and the API creates the correct `ServiceClient` for either online MSAL tokens or on-premises SDK authentication.

**Tech Stack:** Electron main process, React renderer, ASP.NET Core minimal API, Microsoft.PowerPlatform.Dataverse.Client, MSAL Node, Electron `safeStorage`, Node test runner, `dotnet build`.

## Global Constraints

- Keep online connections working exactly as they do now: MSAL token, direct org URL, `ExternalTokenManagement`, `SkipDiscovery = true`.
- Do not rewrite tool endpoints such as Metadata, Fetch, Data Migration, Preview, or Migration unless a compile error proves the shared connection abstraction is insufficient.
- Never persist on-premises passwords in plaintext. After a connection validates successfully, store the on-premises password encrypted with Electron `safeStorage`.
- If Electron `safeStorage` encryption is unavailable, fail the on-premises connection save instead of storing a reversible plaintext or base64 password.
- Validate every saved connection with `WhoAmI` before showing it as connected.
- Support only username/password on-premises auth in the first pass: AD and IFD. Current Windows integrated auth can be added later.

---

## File Structure

- Modify: `desktop/src/ui/components/ConnectionWindow.tsx`
  - Collect online fields as today.
  - Collect on-premises auth mode, username, password, and domain.
- Modify: `desktop/src/ui/vite-env.d.ts`
  - Add typed connection request/result shapes for online and on-premises.
- Modify: `desktop/src/electron/storage.ts`
  - Persist safe metadata and encrypted on-premises password blobs.
- Modify: `desktop/src/electron/main.ts`
  - Store named connections with a type-specific descriptor.
  - Validate on-premises connections through the sidecar before naming/saving.
- Create: `desktop/src/electron/connectionTypes.ts`
  - Shared Electron-side connection descriptor types.
- Create: `desktop/src/electron/secureCredentials.ts`
  - Encrypt/decrypt optional on-premises password values with `safeStorage`.
- Modify: `desktop/src/ui/api/client.ts`
  - Continue sending online bearer headers.
  - For named on-premises connections, send `X-Connection-Name` and no bearer token.
- Modify: `api/PowerTools/PowerTools.API/Filters/DataverseContextFilter.cs`
  - Accept either online bearer headers or an on-premises connection-name header.
- Modify: `api/PowerTools/PowerTools.API/Services/ICurrentConnection.cs`
  - Expose a connection context instead of only token/url.
- Modify: `api/PowerTools/PowerTools.API/Services/DataverseClientFactory.cs`
  - Add `CreateOnline(...)` and `CreateOnPremises(...)`.
- Create: `api/PowerTools/PowerTools.API/Services/ConnectionContext.cs`
  - API-side discriminated connection context.
- Create: `api/PowerTools/PowerTools.API/Services/IConnectionStore.cs`
  - Sidecar in-memory registry for on-premises credentials received from Electron.
- Modify: `api/PowerTools/PowerTools.API/Tools/Connection/ConnectionEndpoints.cs`
  - Add validate/register endpoints for on-premises.
  - Keep connection management endpoints unfiltered by `DataverseContextFilter`; only `/api/connect` should require an active Dataverse request context.

---

## Task 1: Define Shared Connection Shapes

**Files:**
- Create: `desktop/src/electron/connectionTypes.ts`
- Modify: `desktop/src/ui/vite-env.d.ts`

**Interfaces:**
- Produces: `ConnectionInput`, `StoredConnection`, `OnPremisesAuthMode`.
- Consumes: Existing `window.electron.saveConnectionData(data)`.

- [ ] **Step 1: Create Electron connection types**

Create `desktop/src/electron/connectionTypes.ts`:

```ts
import type { AccountInfo } from "@azure/msal-node";

export type CrmType = "online" | "onpremise";
export type OnPremisesAuthMode = "ad" | "ifd";

export type OnlineConnectionInput = {
  crmType: "online";
  serverUrl: string;
};

export type OnPremisesConnectionInput = {
  crmType: "onpremise";
  serverUrl: string;
  authMode: OnPremisesAuthMode;
  username: string;
  password: string;
  domain: string;
};

export type ConnectionInput = OnlineConnectionInput | OnPremisesConnectionInput;

export type StoredOnlineConnection = {
  name: string;
  crmType: "online";
  envUrl: string;
  homeAccountId: string | null;
  account: AccountInfo | null;
};

export type StoredOnPremisesConnection = {
  name: string;
  crmType: "onpremise";
  envUrl: string;
  authMode: OnPremisesAuthMode;
  username: string;
  domain: string;
  encryptedPassword: string;
};

export type StoredConnection = StoredOnlineConnection | StoredOnPremisesConnection;
```

- [ ] **Step 2: Update renderer ambient types**

In `desktop/src/ui/vite-env.d.ts`, replace loose `any` connection arguments with:

```ts
type CrmType = "online" | "onpremise";
type OnPremisesAuthMode = "ad" | "ifd";

type ConnectionInput =
  | { crmType: "online"; serverUrl: string }
  | {
      crmType: "onpremise";
      serverUrl: string;
      authMode: OnPremisesAuthMode;
      username: string;
      password: string;
      domain: string;
    };
```

Keep the existing return types unchanged for this task.

- [ ] **Step 3: Run typecheck**

Run: `npm run build`

Expected: PASS or type errors only where existing call sites need the new explicit fields.

---

## Task 2: Store On-Premises Credentials Safely

**Files:**
- Create: `desktop/src/electron/secureCredentials.ts`
- Modify: `desktop/src/electron/storage.ts`

**Interfaces:**
- Produces: `encryptCredential(value: string): string`, `decryptCredential(value: string): string`.
- Consumes: Electron `safeStorage`.

- [ ] **Step 1: Add credential helper**

Create `desktop/src/electron/secureCredentials.ts`:

```ts
import { safeStorage } from "electron";

export function encryptCredential(value: string): string {
  if (!value) return "";
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure credential storage is not available on this device.");
  }
  const buffer = safeStorage.encryptString(value);
  return buffer.toString("base64");
}

export function decryptCredential(value: string): string {
  if (!value) return "";
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure credential storage is not available on this device.");
  }
  const buffer = Buffer.from(value, "base64");
  return safeStorage.decryptString(buffer);
}
```

- [ ] **Step 2: Extend persisted storage schema**

In `desktop/src/electron/storage.ts`, add fields to persisted connections:

```ts
export type PersistedConnection =
  | {
      name: string;
      crmType: "online";
      envUrl: string;
      homeAccountId: string | null;
    }
  | {
      name: string;
      crmType: "onpremise";
      envUrl: string;
      authMode: "ad" | "ifd";
      username: string;
      domain: string;
      encryptedPassword: string;
    };
```

- [ ] **Step 3: Run desktop test/build**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

---

## Task 3: Add API Connection Context and Store

**Files:**
- Create: `api/PowerTools/PowerTools.API/Services/ConnectionContext.cs`
- Create: `api/PowerTools/PowerTools.API/Services/IConnectionStore.cs`
- Modify: `api/PowerTools/PowerTools.API/Program.cs`

**Interfaces:**
- Produces: `DataverseConnectionContext`, `OnlineConnectionContext`, `OnPremisesConnectionContext`.
- Produces: `IConnectionStore.Get(name)`, `IConnectionStore.Upsert(name, context)`, `IConnectionStore.Delete(name)`.

- [ ] **Step 1: Create API connection context types**

Create `api/PowerTools/PowerTools.API/Services/ConnectionContext.cs`:

```csharp
namespace PowerTools.API.Services;

public abstract record DataverseConnectionContext(string EnvironmentUrl);

public sealed record OnlineConnectionContext(
    string EnvironmentUrl,
    string AccessToken) : DataverseConnectionContext(EnvironmentUrl);

public sealed record OnPremisesConnectionContext(
    string EnvironmentUrl,
    string AuthMode,
    string Username,
    string Password,
    string Domain) : DataverseConnectionContext(EnvironmentUrl);
```

- [ ] **Step 2: Add in-memory connection store**

Create `api/PowerTools/PowerTools.API/Services/IConnectionStore.cs`:

```csharp
using System.Collections.Concurrent;

namespace PowerTools.API.Services;

public interface IConnectionStore
{
    DataverseConnectionContext? Get(string name);
    void Upsert(string name, DataverseConnectionContext context);
    void Delete(string name);
}

public sealed class InMemoryConnectionStore : IConnectionStore
{
    private readonly ConcurrentDictionary<string, DataverseConnectionContext> connections = new();

    public DataverseConnectionContext? Get(string name) =>
        connections.TryGetValue(name, out var context) ? context : null;

    public void Upsert(string name, DataverseConnectionContext context) =>
        connections[name] = context;

    public void Delete(string name) =>
        connections.TryRemove(name, out _);
}
```

- [ ] **Step 3: Register the store**

In `api/PowerTools/PowerTools.API/Program.cs`, add:

```csharp
builder.Services.AddSingleton<IConnectionStore, InMemoryConnectionStore>();
```

- [ ] **Step 4: Build API to alternate output**

Run: `dotnet build api\PowerTools\PowerTools.API\PowerTools.API.csproj -o .codex\api-build-check`

Expected: PASS.

Delete `.codex\api-build-check` after the build.

---

## Task 4: Teach the API Factory Both Auth Modes

**Files:**
- Modify: `api/PowerTools/PowerTools.API/Services/DataverseClientFactory.cs`

**Interfaces:**
- Produces: `Create(DataverseConnectionContext context)`.
- Keeps: Existing direct online behavior.

- [ ] **Step 1: Replace single factory method with context dispatcher**

Use this shape in `DataverseClientFactory.cs`:

```csharp
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.PowerPlatform.Dataverse.Client.Model;

namespace PowerTools.API.Services;

public class DataverseClientFactory
{
    public ServiceClient Create(DataverseConnectionContext context) =>
        context switch
        {
            OnlineConnectionContext online => CreateOnline(online.AccessToken, online.EnvironmentUrl),
            OnPremisesConnectionContext onPremises => CreateOnPremises(onPremises),
            _ => throw new InvalidOperationException("Unsupported Dataverse connection context.")
        };

    public ServiceClient CreateOnline(string accessToken, string environmentUrl)
    {
        var serviceUri = NormalizeServiceUri(environmentUrl);

        return new ServiceClient(new ConnectionOptions
        {
            AuthenticationType = AuthenticationType.ExternalTokenManagement,
            AccessTokenProviderFunctionAsync = _ => Task.FromResult(accessToken),
            ServiceUri = serviceUri,
            RequireNewInstance = true,
            SkipDiscovery = true,
        });
    }

    public ServiceClient CreateOnPremises(OnPremisesConnectionContext connection)
    {
        var authType = connection.AuthMode.Equals("ifd", StringComparison.OrdinalIgnoreCase)
            ? "IFD"
            : "AD";

        var connectionString =
            $"AuthType={authType};" +
            $"Url={NormalizeServiceUri(connection.EnvironmentUrl)};" +
            $"Username={connection.Username};" +
            $"Password={connection.Password};" +
            (string.IsNullOrWhiteSpace(connection.Domain) ? "" : $"Domain={connection.Domain};") +
            "RequireNewInstance=true;";

        return new ServiceClient(connectionString);
    }

    private static Uri NormalizeServiceUri(string environmentUrl) =>
        new(environmentUrl.EndsWith('/') ? environmentUrl : $"{environmentUrl}/");
}
```

- [ ] **Step 2: Build API**

Run: `dotnet build api\PowerTools\PowerTools.API\PowerTools.API.csproj -o .codex\api-build-check`

Expected: PASS.

Delete `.codex\api-build-check` after the build.

---

## Task 5: Update API Filters Without Rewriting Tool Endpoints

**Files:**
- Modify: `api/PowerTools/PowerTools.API/Filters/DataverseContextFilter.cs`
- Modify: `api/PowerTools/PowerTools.API/Filters/DataverseTargetContextFilter.cs`
- Modify: `api/PowerTools/PowerTools.API/Utils/DataverseContextExtensions.cs`

**Interfaces:**
- Consumes: `IConnectionStore`.
- Produces: `HttpContext.Items["DataverseConnectionContext"]`.

- [ ] **Step 1: Let primary filter accept online token or named on-premises connection**

In `DataverseContextFilter.cs`, store an `OnlineConnectionContext` when bearer headers exist, otherwise resolve `X-Connection-Name` from `IConnectionStore`.

- [ ] **Step 2: Let target filter mirror the same idea**

In `DataverseTargetContextFilter.cs`, support `X-Target-Connection-Name` in addition to existing target bearer headers.

- [ ] **Step 3: Update context extensions**

Change `CreateDataverseClient` to call:

```csharp
var connection = ctx.GetDataverseConnectionContext();
var client = factory.Create(connection);
```

Keep compatibility helpers like `GetEnvironmentUrl()` by returning `connection.EnvironmentUrl`.

- [ ] **Step 4: Build API**

Run: `dotnet build api\PowerTools\PowerTools.API\PowerTools.API.csproj -o .codex\api-build-check`

Expected: PASS.

Delete `.codex\api-build-check` after the build.

---

## Task 6: Add On-Premises Register/Validate Endpoint

**Files:**
- Modify: `api/PowerTools/PowerTools.API/Tools/Connection/ConnectionEndpoints.cs`

**Interfaces:**
- Produces: `POST /api/connections/validate-onpremise`.
- Produces: `POST /api/connections/register-onpremise`.

- [ ] **Step 1: Add request DTOs inside `ConnectionEndpoints.cs`**

```csharp
public sealed record OnPremisesConnectionRequest(
    string Name,
    string EnvironmentUrl,
    string AuthMode,
    string Username,
    string Password,
    string Domain);
```

- [ ] **Step 2: Validate on-premises by running WhoAmI**

Add endpoint:

```csharp
group.MapPost("/connections/validate-onpremise",
    (OnPremisesConnectionRequest request, DataverseClientFactory factory) =>
    {
        var context = new OnPremisesConnectionContext(
            request.EnvironmentUrl,
            request.AuthMode,
            request.Username,
            request.Password,
            request.Domain);

        using var svc = factory.Create(context);
        var who = (WhoAmIResponse)svc.Execute(new WhoAmIRequest());
        return Results.Ok(new { connected = true, environment = request.EnvironmentUrl, userId = who.UserId });
    });
```

- [ ] **Step 3: Validate and register in-memory on-premises connection**

Add endpoint:

```csharp
group.MapPost("/connections/register-onpremise",
    (OnPremisesConnectionRequest request, DataverseClientFactory factory, IConnectionStore store) =>
    {
        var context = new OnPremisesConnectionContext(
            request.EnvironmentUrl,
            request.AuthMode,
            request.Username,
            request.Password,
            request.Domain);
        using var svc = factory.Create(context);
        svc.Execute(new WhoAmIRequest());
        store.Upsert(request.Name, context);

        return Results.Ok(new { success = true });
    });
```

- [ ] **Step 4: Build API**

Run: `dotnet build api\PowerTools\PowerTools.API\PowerTools.API.csproj -o .codex\api-build-check`

Expected: PASS.

Delete `.codex\api-build-check` after the build.

---

## Task 7: Wire Electron Main Process

**Files:**
- Modify: `desktop/src/electron/main.ts`
- Modify: `desktop/src/electron/storage.ts`

**Interfaces:**
- Consumes: `encryptCredential`, `decryptCredential`.
- Calls: API `/api/connections/validate-onpremise` and `/api/connections/register-onpremise`.

- [ ] **Step 1: In `save-connection-data`, branch on `crmType`**

For online, keep current MSAL flow.

For on-premises:

```ts
await validateOnPremisesConnection({
  apiBaseUrl: sidecarHandle.baseUrl,
  localSecret: sidecarHandle.secret,
  envUrl,
  authMode: data.authMode,
  username: data.username,
  password: data.password,
  domain: data.domain,
});
```

- [ ] **Step 2: Store temporary on-premises connection data**

Use:

```ts
tempConnectionData = {
  name: undefined,
  crmType: "onpremise",
  envUrl,
  authMode: data.authMode,
  username: data.username,
  domain: data.domain,
  encryptedPassword: encryptCredential(data.password),
};
```

- [ ] **Step 3: Register on-premises connection after naming**

After `save-connection-name`, call the sidecar register endpoint with the decrypted password.

- [ ] **Step 4: Re-register restored on-premises connections at startup**

After `loadState()`, decrypt each restored on-premises password and call the sidecar register endpoint before renderers can use the connection.

- [ ] **Step 5: Run desktop tests/build**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

---

## Task 8: Update Renderer UI for On-Premises

**Files:**
- Modify: `desktop/src/ui/components/ConnectionWindow.tsx`

**Interfaces:**
- Produces: `ConnectionInput` with on-premises fields.

- [ ] **Step 1: Add auth-mode segmented/radio choice for on-premises**

Add values:

```ts
authMode: "ad",
```

- [ ] **Step 2: Show domain only for AD**

For `authMode === "ad"`, show `Domain`.

For `authMode === "ifd"`, show username/email and password.

- [ ] **Step 3: Run desktop build**

Run: `npm run build`

Expected: PASS.

---

## Task 9: Update Renderer Request Headers

**Files:**
- Modify: `desktop/src/ui/api/client.ts`

**Interfaces:**
- For online: keep `Authorization` and `X-Environment-Url`.
- For on-premises: send `X-Connection-Name`.
- For target on-premises: send `X-Target-Connection-Name`.

- [ ] **Step 1: Include `crmType` in cached auth info**

Change:

```ts
interface CachedAuth {
  token?: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  name: string;
}
```

- [ ] **Step 2: Set headers by connection type**

Use:

```ts
if (auth.crmType === "online") {
  config.headers.set("Authorization", `Bearer ${auth.token}`);
  config.headers.set("X-Environment-Url", auth.envUrl);
} else {
  config.headers.set("X-Connection-Name", auth.name);
}
```

- [ ] **Step 3: Mirror target headers**

Use `X-Target-Connection-Name` for target on-premises connections.

- [ ] **Step 4: Run desktop tests/build**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

---

## Task 10: End-to-End Validation Matrix

**Files:**
- No code files unless failures are found.

**Interfaces:**
- Validates existing endpoints through shared connection factory.

- [ ] **Step 1: Online connection still works**

Connect to a known online Dataverse env.

Expected: Microsoft sign-in completes, validation passes, connection appears in status bar.

- [ ] **Step 2: Online tool calls still work**

Open Metadata Explorer.

Expected: tables load.

- [ ] **Step 3: On-premises AD connection validates**

Connect with:

```text
CRM Type: On-Premise
Auth Mode: AD
Server URL: https://server/org
Domain: CONTOSO
Username: user
Password: password
```

Expected: `WhoAmI` validation passes before naming.

- [ ] **Step 4: On-premises IFD connection validates**

Connect with:

```text
CRM Type: On-Premise
Auth Mode: IFD
Server URL: https://org.company.com
Username: user@company.com
Password: password
```

Expected: `WhoAmI` validation passes before naming.

- [ ] **Step 5: Mixed data migration source/target**

Try online source with on-premises target, then on-premises source with online target.

Expected: metadata and migration calls route through the correct primary and target contexts.

- [ ] **Step 6: Final verification commands**

Run:

```powershell
dotnet build api\PowerTools\PowerTools.API\PowerTools.API.csproj -o .codex\api-build-check
npm test
npm run build
npm run lint
```

Expected: API build passes, desktop tests pass, desktop build passes, lint has no new errors.

Delete `.codex\api-build-check` after the API build.

---

## Self-Review

- Spec coverage: online remains unchanged, on-premises gets a separate SDK path, endpoints keep shared `CreateDataverseClient` usage, Data Migration target support is included.
- Placeholder scan: no `TBD`, `TODO`, or intentionally vague implementation steps remain.
- Type consistency: `ConnectionInput`, `StoredConnection`, `DataverseConnectionContext`, and header names are used consistently across tasks.
