# Power Tools repository rules

- `desktop/`: production Electron client for Windows, macOS, and Linux.
- `api/`: local ASP.NET Core API; out of scope for the current client refactor.
- `website/`: product website; out of scope for the current client refactor.
- Read the closest nested `AGENTS.md` before modifying a subsystem.
- Preserve production behavior unless the task explicitly changes it.
- Keep changes small, independently testable, and releasable.
- One change may span `desktop/`, `api/`, and `website/` when the parts belong to the same feature. Keep unrelated changes in separate commits.
- Record user-visible desktop changes under `## [Unreleased]` in `CHANGELOG.md`. See `docs/releasing.md`.
- Preserve existing user changes and secrets.
- Name branches `<type>/<short-description>` (for example `feature/plugin-trace-viewer` or `fix/update-button-overlap`), never random or session-generated names. See `.claude/skills/git-branch-naming/SKILL.md`.
