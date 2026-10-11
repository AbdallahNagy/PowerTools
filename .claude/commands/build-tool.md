---
description: Run the Power Tools tool-building pipeline (research, Dataverse review + UX, develop, review) for a named XrmToolBox plugin or capability.
argument-hint: <tool, plugin, or capability name>
---

Build a new Power Tools tool for: **$ARGUMENTS**

Follow `desktop/docs/tool-building-pipeline.md` exactly. Each stage is a project subagent in `.claude/agents/` (mirrored from `.cursor/agents/`). Subagents do not see each other's chat. The only handoff is `desktop/docs/tools/<tool-id>/brief.md`. Pass each subagent the tool name, the `<tool-id>`, and the brief path, never a summary of earlier output.

0. **Live environment.** Run `node scripts/dataverse-live.mjs check` from the repository root.
   - Exit `2` (not signed in): ask the user for their non-production environment URL, or whether to skip the live check. If they give a URL, run `node scripts/dataverse-live.mjs login start <url>`, show them the sign-in page and code exactly as printed, then run `node scripts/dataverse-live.mjs login finish` (it waits for them) and run `check` again.
   - Exit `1`: show the user the error line once (for example an expired sign-in or a blocked host) and offer the same sign-in.
   - Keep the final result. Exit `0` means the Dataverse expert, developer, and reviewer must use the live environment as `desktop/docs/live-dataverse-environment.md` describes. Otherwise they record why they could not. Do not stop the pipeline once the user has chosen to skip.
1. **Research.** Run the `xrmtoolbox-plugin-researcher` subagent for "$ARGUMENTS". If it reports blockers, no match, or an existing tool that already covers the job, stop and report that. Otherwise take `<tool-id>` from its `### Power Tools mapping` and save the brief **unchanged** as `desktop/docs/tools/<tool-id>/brief.md`.
2. **Stop for user decisions.** If the name is ambiguous, the license is GPL or other copyleft, or the work is two product scopes, ask the user and wait. Record the answer under `### Open questions` in the brief.
3. **Dataverse review and UX, in parallel.** Run the `dataverse-expert` and `power-tools-ux` subagents in the same turn. Each appends only its own heading. When both finish, confirm the brief has `### Dataverse review` and `### UX`, each with content. If one is missing (for example, a write raced the other), rerun only that subagent.
4. **Stop again** if either section appended an open question that needs the user.
5. **Develop.** Only after the gate in step 3 passes, run the `power-tools-developer` subagent. It implements, runs `npm test`, `npm run lint`, `npm run build` (and `npm run check`) from `desktop/`, runs the live Dataverse check against the environment from step 0, appends implementation notes, and opens a draft pull request. Use the session's designated branch when one is set.
6. **Review.** Run the `power-tools-reviewer` subagent on that draft pull request and post its `## Quality check` on the pull request.

Finish with the brief path, the pull request link, the quality-check result, and the live Dataverse check result (the environment URL, or why it did not run). List anything still under `### Open questions`.
