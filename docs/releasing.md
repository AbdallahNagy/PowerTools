# Releasing Power Tools

[`CHANGELOG.md`](../CHANGELOG.md) is the only place release notes are written. It follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). The same notes appear in three places:

- the GitHub release body, set by the [Release Desktop](../.github/workflows/release-desktop.yml) workflow,
- the in-app update dialog, which reads the GitHub release body,
- the website's [changelog page](https://powertools.abdallahnagy.com/changelog), built from `CHANGELOG.md`.

## While you work

Add a line under `## [Unreleased]` for every change a desktop user would notice. Put it under one of these headings: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Write it for users, not as a commit message. Leave out refactors, tests, CI, and docs.

## Cut a release

1. In **Actions**, run **Prepare Release** and pick the bump: `patch` for fixes only, `minor` for new tools or features, `major` for breaking changes. You can type an exact version instead.
2. The workflow opens a `Release x.y.z` pull request. It moves the `[Unreleased]` notes into `## [x.y.z] - <today>`, updates the compare links, and bumps `desktop/package.json`. The pull request body shows the release notes. Edit `CHANGELOG.md` on that branch if they need work.
3. Merge it. **Release Desktop** starts on its own, builds the installer, and publishes the GitHub release with those notes. Installed apps then offer the update.

Prepare Release fails if `[Unreleased]` is empty, so a release always has notes.

### One-time setup

- Turn on **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or Prepare Release cannot open the pull request.
- Optional: GitHub does not start other workflows for pull requests opened with the default token, so Desktop CI runs only after the merge. To run it on the release pull request too, add a fine-grained personal access token with **Contents** and **Pull requests** write access to this repository as the `RELEASE_PR_TOKEN` secret.

## Without the workflow

`node scripts/changelog.mjs release <patch|minor|major|x.y.z>` does the changelog part locally and prints the new version. Then run `npm version <x.y.z> --no-git-tag-version` in `desktop/`, open a pull request, and merge it. Release Desktop publishes it the same way.

## Fix published notes

Edit the version's section in `CHANGELOG.md` and merge. Then run **Release Desktop** by hand with **Only update the release notes** checked.
