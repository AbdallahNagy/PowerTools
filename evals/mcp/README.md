# MCP live tests and agent evals

Two opt-in suites check the Power Tools MCP server against real Dataverse sandboxes, one online and one on-premises. They are never part of `npm test`, and they must never point at production.

| Suite | Command (from `desktop/`) | What it does |
|---|---|---|
| Live tests | `npm run test:live:mcp` | Calls the tools directly over MCP, with no model. Checks that every sandbox answers with the same result shape (the parity check). From Phase 1, each family adds an apply lifecycle: apply, verify, apply again (must be `unchanged`), remove, back as before. |
| Agent evals | `npm run eval:mcp` | Runs each scenario in `scenarios/` through Claude Code in headless mode with the Power Tools MCP server, on every sandbox. Then checks the sandbox with plain MCP queries, never by asking a model. Writes `results/<time>.json` with pass or fail, tool calls, tool errors, approvals asked, cost and time per run. |

The code is in `desktop/test/live/mcp/`. Its pure parts (parity, scenario checks, transcript reading) are unit-tested in `desktop/test/electron/mcp/liveHarness.test.ts`, which does run in `npm test`.

## Setup

1. Start Power Tools and turn on the MCP server in Settings. The suites find it through its discovery file, `%APPDATA%\Power Tools\mcp-endpoint.json`.
2. Save one connection per sandbox in Power Tools.
3. Copy `sandboxes.example.json` to `sandboxes.json` (not committed) and fill in the connection display names. `POWERTOOLS_LIVE_CONFIG` can point at another file.
4. For evals, write an MCP config file for Claude Code that adds the connector as `powertools` (the command Settings shows under "Connect a client"), and set `claudeMcpConfig` to it.
5. Create an unmanaged solution `PowerToolsEvals` with publisher prefix `pte` on each sandbox. The Phase 1 scenarios build into it.

Without `sandboxes.json` both suites skip with a message.

## Scenarios

One JSON file per scenario:

| Field | Meaning |
|---|---|
| `id`, `description` | Kebab-case id, and what the scenario proves. |
| `phase` | The phase that makes it runnable. Later phases are listed but skipped. Set `POWERTOOLS_EVAL_PHASE` to the current phase. |
| `prompt` | What the agent is asked. `{connection}` becomes the sandbox's connection name. |
| `sandboxes` | Optional. Limits the scenario, for example to `["onprem"]`. |
| `setup`, `cleanup` | Tool calls run before the agent and after the checks. Cleanup runs even when a check fails. |
| `checks` | MCP tool calls whose `structuredContent` is tested at `path` with `equals`, `atLeast` or `exists`. |
| `mustNotCall`, `mustAsk` | Negative scenarios: tools the agent must not call, and whether the user must have been asked. |

## What is still needed from the product owner

These block running the suites for real. The harness is built and its logic is tested, but it has not run against Dataverse.

1. **Two sandboxes.** An online environment and an on-premises server that the tests may change and reset. This is open question 3 in `desktop/docs/mcp-tool-architecture.md`. Without the on-premises one, the parity check proves nothing.
2. **Supported on-premises versions** (open question 2). The `Capabilities` probe reads the version and the feature tables, but which versions to test on decides the sandbox to set up.
3. **Unattended approvals.** Changes on a connection with "let agents make changes" turned on run without a dialog, so turn that on for the sandbox connections. Destructive steps (remove, record deletes, imports) always ask a person by design. Until there is a sandbox-only way to approve them, a person answers those dialogs during a run, or the destructive scenarios are run by hand.
4. **Layers on-premises** (open question 4). Checking whether `solutions_list_layers` and `solutions_remove_active_layer` work on-premises needs the on-premises sandbox.
