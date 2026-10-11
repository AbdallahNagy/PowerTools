# Power Tools repository rules

- `desktop/`: production Windows Electron client.
- `api/`: local ASP.NET Core API; out of scope for the current client refactor.
- `website/`: product website; out of scope for the current client refactor.
- Read the closest nested `AGENTS.md` before modifying a subsystem.
- Preserve production behavior unless the task explicitly changes it.
- Keep changes small, independently testable, and releasable.
- Do not mix unrelated API, desktop, and website changes.
- Preserve existing user changes and secrets.
- Name branches `<type>/<short-description>` (for example `feature/plugin-trace-viewer` or `fix/update-button-overlap`), never random or session-generated names. See `.claude/skills/git-branch-naming/SKILL.md`.
