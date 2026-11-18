# PowerTools.API tests

One xUnit project covers all of `PowerTools.API`. The folders mirror production:

| Production | Tests | Namespace |
| --- | --- | --- |
| `PowerTools.API/Tools/<Tool>/` | `Tools/<Tool>/` | `PowerTools.API.Tests.Tools.<Tool>` |
| `PowerTools.API/Services/` | `Services/` | `PowerTools.API.Tests.Services` |
| `ThirdParty/Data8...` | `ThirdParty/` | `PowerTools.API.Tests.ThirdParty` |

A new tool gets a new folder here, never a new test project. Keep a tool's fakes and builders inside its own folder, so each tool stays independent of the others.

Test a tool's service against a fake of its client interface (for example `FakeAttributeExplorerClient : IAttributeExplorerClient`). The tests run with no Dataverse org, credentials, or network beyond loopback.

Run everything, or one tool by namespace:

```
dotnet test api/PowerTools/PowerTools.API.Tests
dotnet test api/PowerTools/PowerTools.API.Tests --filter "FullyQualifiedName~PowerTools.API.Tests.Tools.Translator."
```

The trailing dot in the filter keeps `Tools.Agent.` from also matching a future `Tools.AgentX`.

`Tools/PluginRegistration/TestFixtures/` holds small .NET Framework plugin assemblies. The test project's `BuildAndCopyInspectionFixtures` target builds them into `bin/.../Fixtures/` before compiling. They are excluded from this project's compile items.

`PowerTools.McpConnector` has its own project, `PowerTools.McpConnector.Tests`, because `PowerTools.API` also compiles the connector's source files; referencing both from one project would give duplicate `PowerTools.Mcp` types.
