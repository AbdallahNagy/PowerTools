---
description: Run the Power Tools tool-building pipeline (research, Dataverse review + UX, develop, review) for a named XrmToolBox plugin or capability.
argument-hint: <tool, plugin, or capability name>
---

Build a new Power Tools tool for: **$ARGUMENTS**

Follow `desktop/docs/tool-building-pipeline.md` exactly. Each stage is a project subagent in `.claude/agents/` (mirrored from `.cursor/agents/`). Subagents do not see each other's chat. The only handoff is `desktop/docs/tools/<tool-id>/brief.md`. Pass each subagent the tool name, the `<tool-id>`, and the brief path, never a summary of earlier output.

1. **Research.** Run the `xrmtoolbox-plugin-researcher` subagent for "$ARGUMENTS". If it reports blockers, no match, or an existing tool that already covers the job, stop and report that. Otherwise take `<tool-id>` from its `### Power Tools mapping` and save the brief **unchanged** as `desktop/docs/tools/<tool-id>/brief.md`.
2. **Stop for user decisions.** If the name is ambiguous, the license is GPL or other copyleft, or the work is two product scopes, ask the user and wait. Record the answer under `### Open questions` in the brief.
3. **Dataverse review and UX, in parallel.** Run the `dataverse-expert` and `power-tools-ux` subagents in the same turn. Each appends only its own heading. When both finish, confirm the brief has `### Dataverse review` and `### UX`, each with content. If one is missing (for example, a write raced the other), rerun only that subagent.
4. **Stop again** if either section appended an open question that needs the user.
5. **Develop.** Only after the gate in step 3 passes, run the `power-tools-developer` subagent. It implements, runs `npm test`, `npm run lint`, `npm run build` (and `npm run check`) from `desktop/`, appends implementation notes, and opens a draft pull request. Use the session's designated branch when one is set.
6. **Review.** Run the `power-tools-reviewer` subagent on that draft pull request and post its `## Quality check` on the pull request.

Finish with the brief path, the pull request link, and the quality-check result. List anything still under `### Open questions`.
