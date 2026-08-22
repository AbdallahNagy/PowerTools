# Creating PowerTools Tools Skill Design

## Goal

Create a repository-local skill that takes a user-approved brief for a brand-new PowerTools built-in tool through complete desktop implementation and verification.

The skill does not migrate legacy tools. It stays within `desktop/` unless the user explicitly authorizes work in `api/` or `website/`.

## Skill Location

The checked-in skill lives at:

```text
.agents/skills/creating-powertools-tools/
|-- SKILL.md
`-- references/
    `-- tool-contract.md
```

`SKILL.md` contains the reusable decision workflow. `references/tool-contract.md` contains PowerTools-specific paths, boundaries, integration points, and verification guidance. The skill has no scaffolding script because each complete tool should be shaped by its behavior rather than a rigid generated template.

## Invocation Boundary

The skill applies when a user asks to create or add a brand-new built-in tool to the PowerTools desktop client. It does not apply to general desktop features, legacy-tool migration, runtime plugins, API-only work, or website work.

Automatic discovery remains enabled. The skill may also be invoked explicitly as `$creating-powertools-tools`.

## Workflow

### 1. Establish current constraints

Before designing or editing, the agent reads the repository and closest subsystem instructions. It inspects the current tool definition, registry, runtime host, public shared and platform APIs, comparable tools, and verification commands.

Repository source and current instructions are authoritative. The reference helps locate and interpret them but does not replace them.

### 2. Define the tool

The agent turns the user's brief into an explicit design covering:

- Purpose and user-visible behavior
- Stable kebab-case tool ID, title, tooltip, and icon
- Activity-bar visibility
- Single- or multi-instance behavior
- Required shared, platform, connection, or API capabilities
- Loading, empty, validation, success, and error states

The agent resolves material ambiguities and obtains design approval before implementation.

### 3. Implement test-first

The agent adds failing behavioral and registry coverage before production implementation, confirms the expected failure, and then writes the minimum code needed to pass.

The tool owns one folder under `desktop/src/ui/tools/<tool-id>/` and exports one typed manifest from `tool.ts`. Tool-specific components, state, models, API calls, fixtures, and tests remain private to that folder. The central registry imports the manifest and registers it once in the intended order.

Tools may consume public shared and platform capabilities. They must not import another tool's private files or shell internals, add raw renderer access to Electron, or manually manage status identifiers.

### 4. Verify and report

The agent runs focused tests while developing, then uses the current desktop aggregate verification command before completion. Test environments and credential requirements come from the repository's current instructions and the user-approved scope; the skill does not hardcode a credential policy.

The completion report identifies the created behavior and files, verification results, and any unrelated pre-existing warnings or environment failures separately. New regressions remain blocking.

## PowerTools Contract Reference

`references/tool-contract.md` records the current discovery map for:

- `desktop/src/ui/tools/defineTool.ts`
- `desktop/src/ui/tools/registry.tsx`
- `desktop/src/ui/tools/<tool-id>/tool.ts`
- Tool runtime and error-boundary APIs
- Shared status and platform boundaries
- Registry and renderer test locations
- Focused and aggregate verification commands

The reference describes invariants and navigation cues, not copied implementation bodies. Agents re-inspect these files so ordinary repository evolution does not make the skill unsafe.

## Error and Scope Handling

- Missing tool behavior or manifest choices are clarified before editing when they materially affect the result.
- Requests that require `api/` or `website/` changes pause for explicit scope approval.
- Existing public capabilities are preferred over new cross-layer coupling.
- A failing focused test is diagnosed before broader verification.
- Aggregate failures are separated into new regressions, pre-existing issues, and environment limitations with supporting command output.

## Skill Validation

Creation follows a behavior-first skill test:

1. Give an independent agent a realistic new PowerTools tool request without the skill and record contract omissions or incorrect assumptions.
2. Write the smallest skill and reference that address observed failures.
3. Validate the skill structure and frontmatter.
4. Repeat the realistic request with the skill available in an isolated test workspace.
5. Confirm the result follows current instructions, designs before editing, preserves subsystem boundaries, tests the manifest and behavior, registers the tool once, and invokes current verification.
6. Refine only where the forward test exposes a concrete gap.

## Non-Goals

- Migrating or refactoring existing legacy tools
- Runtime or third-party plugin loading
- A universal component or page template
- Automatic API or website expansion
- A permanently fixed credential or test-environment policy
- Replacing repository instructions or current source inspection
