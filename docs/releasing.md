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
3. Merge it. **Release Desktop** starts on its own, builds the Windows, macOS, and Linux installers on their own runners, and publishes one GitHub release with all of them and those notes. Installed apps then offer the update.

| Platform | Files on the release | Update feed |
|---|---|---|
| Windows | `PowerTools-Setup.exe` | `latest.yml` |
| macOS | `PowerTools-mac-arm64.dmg`, `PowerTools-mac-x64.dmg`, and a `.zip` of each for updates | `latest-mac.yml` |
| Linux | `PowerTools-linux-x86_64.AppImage`, `PowerTools-linux-amd64.deb` | `latest-linux.yml` |

The release is published only when all three builds succeed.

Prepare Release fails if `[Unreleased]` is empty, so a release always has notes.

### One-time setup

- Turn on **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or Prepare Release cannot open the pull request.
- Optional, macOS signing: without these secrets the macOS app is ad-hoc signed. Users then allow it once under **System Settings → Privacy & Security → Open Anyway**, and the app still sees new versions, but macOS refuses to install updates into an unsigned app, so users download each new version from the release page. To sign and notarize, add `MAC_CERTIFICATE` (a base64 Developer ID Application `.p12`), `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- Optional: GitHub does not start other workflows for pull requests opened with the default token, so Desktop CI runs only after the merge. To run it on the release pull request too, add a fine-grained personal access token with **Contents** and **Pull requests** write access to this repository as the `RELEASE_PR_TOKEN` secret.

## Without the workflow

`node scripts/changelog.mjs release <patch|minor|major|x.y.z>` does the changelog part locally and prints the new version. Then run `npm version <x.y.z> --no-git-tag-version` in `desktop/`, open a pull request, and merge it. Release Desktop publishes it the same way.

## Fix published notes

Edit the version's section in `CHANGELOG.md` and merge. Then run **Release Desktop** by hand with **Only update the release notes** checked.
