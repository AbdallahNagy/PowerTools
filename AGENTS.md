# Power Tools repository rules

- `desktop/`: production Windows Electron client.
- `api/`: local ASP.NET Core API; out of scope for the current client refactor.
- `website/`: product website; out of scope for the current client refactor.
- Read the closest nested `AGENTS.md` before modifying a subsystem.
- Preserve production behavior unless the task explicitly changes it.
- Keep changes small, independently testable, and releasable.
- Do not mix unrelated API, desktop, and website changes.
- Preserve existing user changes and secrets.

## Agent skills

### Issue tracker

Issues and specifications are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-document layout. See `docs/agents/domain.md`.
