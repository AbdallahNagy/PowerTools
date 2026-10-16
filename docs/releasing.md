# Releasing Power Tools

[`CHANGELOG.md`](../CHANGELOG.md) is the only place release notes are written. It follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). The same notes appear in three places:

- the GitHub release body, set by the [Release Desktop](../.github/workflows/release-desktop.yml) workflow,
- the in-app update dialog, which reads the GitHub release body,
- the website's [changelog page](https://powertools.abdallahnagy.com/changelog), built from `CHANGELOG.md`.

## While you work

Add a line under `## [Unreleased]` for every change a desktop user would notice. Put it under one of these headings: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Write it for users, not as a commit message. Leave out refactors, tests, CI, and docs.

## Cut a release

1. Pick the version. Bump the major version for breaking changes, the minor version for new tools or features, and the patch version for fixes only.
2. In `CHANGELOG.md`:
   - Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`.
   - Add a new, empty `## [Unreleased]` above it.
   - At the end of the file, point `[Unreleased]` at `compare/vx.y.z...HEAD` and add `[x.y.z]: https://github.com/AbdallahNagy/PowerTools/compare/v<previous>...vx.y.z`.
3. Set `version` in `desktop/package.json` (and `desktop/package-lock.json`) to `x.y.z`.
4. Run `node scripts/changelog.mjs check` and `node scripts/changelog.mjs extract x.y.z` to preview the notes.
5. Merge to `main`, then run the **Release Desktop** workflow from the Actions tab. It fails if `CHANGELOG.md` has no section for the version.

To fix the notes of a published release, edit its section in `CHANGELOG.md`, merge, and run **Release Desktop** with **Only update the release notes** checked.
