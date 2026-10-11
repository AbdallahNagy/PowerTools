---
name: git-branch-naming
description: "Use before creating, naming, renaming, or pushing a git branch in this repository, including before the first commit of any feature, fix, or docs change. Branches use a type prefix (feature/, fix/, hotfix/, chore/, docs/, refactor/, test/, release/) and a short, descriptive kebab-case name such as feature/solution-translator or fix/update-button-overlap. Never use random or session-generated names such as claude/vibrant-turing-gqlqpf or ccr-af344bcf-94pqou."
---

# Git branch naming

Every branch name says what kind of change it holds and what the change is. A reviewer should understand the branch from its name alone.

## Format

```
<type>/<short-description>
<type>/<issue-number>-<short-description>
```

- `<type>` is one of the prefixes below.
- `<short-description>` is 2 to 5 words in lowercase kebab-case that describe the change, not the person or tool that made it.
- Add the GitHub issue number first when the work closes an issue: `fix/42-sidecar-crash-on-startup`.

## Prefixes

| Prefix      | Use for                                                        | Example                                  |
| ----------- | -------------------------------------------------------------- | ---------------------------------------- |
| `feature/`  | New user-facing capability, including a new tool               | `feature/plugin-trace-viewer`            |
| `fix/`      | Bug fix that goes through the normal review cycle              | `fix/update-button-overlap`              |
| `hotfix/`   | Urgent fix for a released version                              | `hotfix/1.1.1-login-crash`               |
| `refactor/` | Code restructuring with no behavior change                     | `refactor/shared-tool-sidebar`           |
| `chore/`    | Build, CI, dependencies, release tooling, repo config          | `chore/github-release-workflow`          |
| `docs/`     | Documentation, README, briefs, agent and skill files only      | `docs/git-branch-naming-skill`           |
| `test/`     | Tests only                                                     | `test/translator-apply-flow`             |
| `release/`  | Preparing a release                                            | `release/1.2.0`                          |

When a change fits more than one type, pick the one that matters most to users: a fix that also refactors is `fix/`.

## Rules

- Lowercase letters, digits, and hyphens only after the prefix. No spaces, underscores, uppercase, or trailing slashes.
- Keep the whole name under about 50 characters.
- Describe the change: `feature/solution-translator`, not `feature/new-stuff`, `feature/update`, or `feature/abdallah`.
- Never use random, generated, or tool-branded names: `claude/vibrant-turing-gqlqpf`, `ccr-af344bcf-94pqou`, `cursor/...`, `codex/...`, `patch-1`.
- One branch per change. Do not reuse a branch after its pull request is merged; start a new one from `main`.
- Do not mix desktop, API, and website work on one branch (see `AGENTS.md`).

## Workflow

1. Before the first commit, decide the type and description from the task.
2. Start from the latest `main`:

   ```bash
   git fetch origin main
   git checkout -b feature/plugin-trace-viewer origin/main
   ```

3. Push with upstream tracking: `git push -u origin feature/plugin-trace-viewer`.
4. Open pull requests from that branch. The pull request title should read like the branch description in sentence case.

## Environments that pre-assign a branch

Some agent environments, such as Claude Code on the web, check out a generated branch like `claude/<adjective>-<name>-<suffix>` at the start of a session. The repository owner wants conventional names instead:

1. Before the first commit, create the conventional branch from the current `HEAD`: `git checkout -b <type>/<short-description>`.
2. Commit and push to that branch, and open any pull request from it.
3. Tell the user the branch name you used.

If the environment refuses the push or its own rules forbid pushing to any branch but the assigned one, do not work around it. Push to the assigned branch, tell the user which conventional name you would have used, and let them rename the branch on GitHub (Branches > rename) before the pull request is opened.

If a pull request is already open from a generated branch, do not recreate it under a new name locally and re-push; that leaves the open pull request on the old branch. Either rename it on GitHub, which keeps the pull request, or use the convention on the next branch.
