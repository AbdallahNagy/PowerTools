# Power Tools guidance

Read and follow `AGENTS.md` in this directory and any closer `AGENTS.md` for the files being changed. The `AGENTS.md` files are the canonical repository instructions.

## Agents

The tool-building agents are defined once in `.cursor/agents/`. `.claude/agents/` holds generated copies for Claude Code. Edit `.cursor/agents/*.md`, then run `node scripts/sync-agents.mjs`. Do not edit `.claude/agents/*.md` directly.

Run the full pipeline with `/build-tool <tool name>`. The pipeline is described in `desktop/docs/tool-building-pipeline.md`.

## Agent skills

### Issue tracker

Issues and wayfinder maps live in GitHub Issues for AbdallahNagy/PowerTools, used through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default seven labels: bug, enhancement, needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md`, plus ADRs in `docs/adr/` once the first is written. See `docs/agents/domain.md`.

### External peers

`auto`: picks the Claude or Codex adapter, default models, effort high. See `docs/agents/cross-model.json`.
