# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json title,state,labels,body,comments --jq '.title, .state, ([.labels[].name] | join(", ")), .body, (.comments[] | "--- \(.author.login): \(.body)")'`. Piped, `gh issue view --comments` prints the comments alone, without the body.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **List children**: the open issues whose `## Parent` section names `<number>`, each with its count of open blockers: `gh api 'repos/{owner}/{repo}/issues?state=open&per_page=100' --paginate --jq '.[] | select(.body // "" | test("## Parent\\s+#<number>\\b")) | "\(.number) blocked_by=\(.issue_dependencies_summary.blocked_by) \(.title)"'`, plus any sub-issues (`gh api repos/{owner}/{repo}/issues/<number>/sub_issues --paginate --jq '.[] | select(.state == "open") | "\(.number) blocked_by=\(.issue_dependencies_summary.blocked_by) \(.title)"'`).
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "<name>"` or `--remove-label "<name>"`
- **Create a missing label**: `--label` / `--add-label` fails on a label the repo doesn't have yet. Create it first with `gh label create "<name>" --force`.
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --json title,state,body,comments --jq '.title, .state, .body, (.comments[] | "--- \(.author.login): \(.body)")'` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list` has no author association field, so use the REST API: `gh api 'repos/{owner}/{repo}/pulls?state=open' --paginate --jq '[.[] | select(.author_association | IN("CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE")) | {number, title, body, author: .user.login, labels: [.labels[].name]}]'`. This drops `OWNER`/`MEMBER`/`COLLABORATOR`. Read each PR's comments with `gh pr view`.
- **Comment / label / close**: `gh pr comment`, `gh pr close`, and `gh pr edit` with `--add-label` or `--remove-label`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve it in one call with `gh api 'repos/{owner}/{repo}/issues/42' --jq 'if .pull_request then "pr" else "issue" end'`, which answers for both kinds.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the issue"

Run the **Read an issue** command above.

## Wayfinding operations

Used by `/wayfinder`; `/to-tickets` uses **Blocking** too. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions so far / Added so far / Not yet specified / Out of scope body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's children with `gh api repos/<owner>/<repo>/issues/<map>/sub_issues --paginate` (or read the map's task list where sub-issues aren't enabled). Keep the open ones (`state == "open"`), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
