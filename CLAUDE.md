# Dyno guidance

@AGENTS.md

The `AGENTS.md` files are the canonical repository instructions. Also follow any closer `AGENTS.md` for the files being changed.

## Agents

The tool-building agents are defined once in `.cursor/agents/`. `.claude/agents/` holds generated copies for Claude Code. Edit `.cursor/agents/*.md`, then run `node scripts/sync-agents.mjs`. Do not edit `.claude/agents/*.md` directly.

Run the full pipeline with `/build-tool <tool name>`. The pipeline is described in `desktop/docs/tool-building-pipeline.md`.
