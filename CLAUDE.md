# Power Tools guidance

Read and follow `AGENTS.md` in this directory and any closer `AGENTS.md` for the files being changed. The `AGENTS.md` files are the canonical repository instructions.

## Agents

The tool-building agents are defined once in `.cursor/agents/`. `.claude/agents/` holds generated copies for Claude Code. Edit `.cursor/agents/*.md`, then run `node scripts/sync-agents.mjs`. Do not edit `.claude/agents/*.md` directly.

Run the full pipeline with `/build-tool <tool name>`. The pipeline is described in `desktop/docs/tool-building-pipeline.md`.
