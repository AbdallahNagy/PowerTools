# Dyno.Api tests

One xUnit project covers all of `Dyno.Api`. The folders mirror production:

| Production | Tests | Namespace |
| --- | --- | --- |
| `Dyno.Api/Tools/<Tool>/` | `Tools/<Tool>/` | `Dyno.Api.Tests.Tools.<Tool>` |
| `Dyno.Api/Services/` | `Services/` | `Dyno.Api.Tests.Services` |
| `ThirdParty/Data8...` | `ThirdParty/` | `Dyno.Api.Tests.ThirdParty` |

A new tool gets a new folder here, never a new test project. Keep a tool's fakes and builders inside its own folder, so each tool stays independent of the others.

Test a tool's service against a fake of its client interface (for example `FakeAttributeExplorerClient : IAttributeExplorerClient`). The tests run with no Dataverse org, credentials, or network beyond loopback.

Run everything, or one tool by namespace:

```
dotnet test api/Dyno/Dyno.Api.Tests
dotnet test api/Dyno/Dyno.Api.Tests --filter "FullyQualifiedName~Dyno.Api.Tests.Tools.Translator."
```

The trailing dot in the filter keeps `Tools.Agent.` from also matching a future `Tools.AgentX`.

`Tools/PluginRegistration/TestFixtures/` holds small .NET Framework plugin assemblies. The test project's `BuildAndCopyInspectionFixtures` target builds them into `bin/.../Fixtures/` before compiling. They are excluded from this project's compile items.

`Dyno.McpConnector` has its own project, `Dyno.McpConnector.Tests`, because `Dyno.Api` also compiles the connector's source files; referencing both from one project would give duplicate `Dyno.Mcp` types.
