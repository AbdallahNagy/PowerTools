# Catalog hosting and publisher verification for community tools

Research for [#98](https://github.com/AbdallahNagy/PowerTools/issues/98), part of the map "Community tools v1" ([#95](https://github.com/AbdallahNagy/PowerTools/issues/95)).

**Question.** What are the options for hosting the community tool catalog and verifying publishers? Compare npm (with provenance), a GitHub index repository with release assets, and a self-hosted index. Also cover signing (Sigstore, minisign, Authenticode). For each: cost, how submission and review work, how the app checks integrity and publisher identity offline and online, and how updates are found.

**Researched:** 2026-11-03. Sources were read on that date. Versions that matter: electron 39.1.1, electron-builder 26.0.12 and electron-updater 6.8.9 (from `desktop/package-lock.json`); `sigstore` (npm) 5.0.0 and 4.1.1.

Vocabulary follows `GLOSSARY.md`: a **community tool** is a third-party tool the user installs, running sandboxed behind the **Host API**, and it may ship **tool workers**. Third-party products below keep their own names (for example "Obsidian community plugins").

Labels: **Fact** is something a cited source states or that I observed directly. **Inference** is my reading of facts. **Recommendation** is a proposal.

## Short answer

For a solo maintainer with no budget, the strongest combination is:

1. **A GitHub index repository** for curation. Authors open a pull request to be listed, and CI validates it. The maintainer reviews new listings and publisher changes, not every release.
2. **Author GitHub releases with GitHub artifact attestations** for distribution and publisher identity. The attestation is a Sigstore bundle that binds the zip's SHA-256 to the author's repository and workflow. It is free for public repositories.
3. **A catalog file built by CI and signed with one maintainer Ed25519 key** (minisign format, or raw Ed25519 through Node `crypto`). It is published as a static file on GitHub Pages or as a release asset of the index repository. The app pins the public key, verifies the catalog, then verifies each downloaded tool against the digest and the Sigstore bundle recorded in the catalog.

npm with provenance is a close second. It uses the same Sigstore verification path, so the catalog format can allow an `npm` source later without new crypto code. Authenticode does not apply to community tools, because they are web bundles, not PE files. It matters only for the Power Tools installer itself.

The rest of this document gives the evidence.

## What every option must provide

- A **curated list** that the app can trust. Neither npm search nor GitHub search is curated.
- **Integrity** of the downloaded bytes.
- **Publisher identity**: proof that version N+1 comes from the same publisher as version N.
- **Update discovery** that does not hit low rate limits. The unauthenticated GitHub REST API allows 60 requests per hour ([GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
- **Offline re-verification** of installed tools at launch.
- **A revocation path** (kill switch).

**Inference.** "Hosting the bytes" and "hosting the catalog" are separate decisions. npm and GitHub releases both host bytes well. Neither gives you a curated, signed catalog, so every viable design adds a small index that the maintainer controls.

## Option 1: npm with provenance

**Cost.** Free for public packages. Trusted publishing runs on GitHub-hosted runners, which are free for public repositories ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).

**How it works (Fact).**

- *Provenance* links a package to its source repository and build instructions. Packages are signed by the Sigstore public-good servers and recorded in a public transparency log. Provenance needs npm CLI 9.5.0 or later, a cloud-hosted GitHub Actions or GitLab runner, and a public `repository` field that matches the source ([npm: generating provenance statements](https://docs.npmjs.com/generating-provenance-statements)).
- *Trusted publishing* (OIDC, no long-lived tokens) supports GitHub Actions, GitLab.com and CircleCI cloud. It does not support self-hosted runners. It needs npm CLI 11.5.1 or later and Node 22.14.0 or later. Provenance is generated automatically for public repositories and packages, but not for CircleCI publishes or private repositories ([npm: trusted publishers](https://docs.npmjs.com/trusted-publishers)).
- *Registry signatures*: npm signs `${name}@${version}:${dist.integrity}` with ECDSA P-256. Public keys are at `registry.npmjs.org/-/npm/v1/keys` ([npm: about registry signatures](https://docs.npmjs.com/about-registry-signatures)).
- *Immutability*: "Once `package@version` has been used, you can never use it again", even after an unpublish ([npm unpublish policy](https://docs.npmjs.com/policies/unpublish)).
- *Observed* on `sigstore@5.0.0`: the version document has `dist.integrity` (sha512), `dist.signatures`, and `dist.attestations.url` pointing to `https://registry.npmjs.org/-/npm/v1/attestations/sigstore@5.0.0`. That endpoint returns two Sigstore bundles: an npm publish attestation and a SLSA v1 provenance attestation.
- *Threat context*: the Shai-Hulud worm (September 2025) spread "via compromised maintainer accounts". GitHub removed more than 500 packages and planned short-lived tokens, mandatory 2FA and wider trusted publishing ([GitHub blog, 2025-09-22](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/)).

**Submission and review.** The author publishes to npm, ideally through trusted publishing from the starter template's workflow. To be listed, they still need a pull request or form to the Power Tools index, because npm has no curation. Review is the same as in Option 2.

**Integrity and identity.**

- *Online*: download the tarball, check `dist.integrity`, fetch the attestation bundle, and verify it with `sigstore-js`. Pin `certificateIssuer` to `https://token.actions.githubusercontent.com` and `certificateIdentityURI` to the author's repository and workflow ([sigstore-js README](https://github.com/sigstore/sigstore-js/blob/main/packages/client/README.md)).
- *Offline*: store the tarball digest and bundle at install time and re-verify against a cached trusted root (see Sigstore below). Registry ECDSA keys can also be pinned in the app.

**Updates.** Read `dist-tags.latest` from `registry.npmjs.org/<name>`. That endpoint has no GitHub-style rate limit, but the app would make one call per installed tool, unless the catalog does the polling (Recommendation).

**Strengths.** Immutable versions by policy, free global CDN, and provenance on by default with trusted publishing. Authors already use npm for the typed SDK.

**Weaknesses.**

- Authors who publish from a laptop produce no provenance, so the app has only the npm account name to go on.
- A tarball is a source-package format, so the app must unpack it itself and ignore `package.json` lifecycle scripts (Inference: never run `npm install` on a community tool).
- A second identity system (npm accounts) sits next to GitHub, and the Power Tools catalog is still needed.

## Option 2: GitHub index repository with release assets

This is the Obsidian model.

**Reference: Obsidian (Fact).**

- `community-plugins.json` in `obsidianmd/obsidian-releases` lists `id`, `name`, `author`, `description` and `repo`.
- The app reads the author's `manifest.json` on the default branch to find the latest version. It then downloads `main.js`, `manifest.json` and `styles.css` from the GitHub release whose tag equals that version ([obsidian-releases README](https://github.com/obsidianmd/obsidian-releases)).
- Submission has moved to a directory at community.obsidian.md with automated review. That directory reads the manifest at HEAD and checks repository ownership through GitHub sign-in ([Obsidian: submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)). The repository is still updated by a "Mirror community plugins" job; I observed commits on 2026-11-03.
- *Inference*: Obsidian pins no hashes or signatures, so the author (or anyone holding their GitHub account) can swap release assets after review.

**Cost.** Free. Releases allow up to 1000 assets of under 2 GiB each, with "no limit on the total size of a release, nor bandwidth usage" ([About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)).

**Integrity and identity (Fact).**

- *Artifact attestations* are available on all current plans for public repositories; private repositories need Enterprise Cloud ([github/docs gated-features reusable](https://github.com/github/docs/blob/main/data/reusables/gated-features/attestations.md)).
- Public repositories use the Sigstore public-good instance with a public transparency log ([Artifact attestations concepts](https://docs.github.com/en/actions/concepts/security/artifact-attestations)).
- The workflow needs `id-token: write` and `attestations: write`, and uses `actions/attest` ([Using artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)).
- Attestations are "not a guarantee that an artifact is secure". They prove where and how the artifact was built.
- *Offline verification* is documented: download the bundle with `gh attestation download` and the trusted root with `gh attestation trusted-root`, then verify with `--bundle` and `--custom-trusted-root`. The trusted root has no built-in expiry. Signatures made after the root was saved verify until Sigstore rotates keys, "typically ... a few times per year". You cannot detect revocation offline. Repository renames can make owner/name matching stale, so check the immutable repository ID in the certificate ([Verify attestations offline](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)).
- *Immutable releases* lock assets and the tag and generate a release attestation. They are opt-in per repository or organization, and they are checked with `gh release verify` and `gh release verify-asset` ([Immutable releases](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases), [verify-release-integrity source](https://github.com/github/docs/blob/main/content/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity.md)).
- *Observed*: the GitHub releases API returns a `digest` (`sha256:...`) per asset and an `immutable` flag. The Power Tools `v1.2.0` release shows `immutable: false`.

**Submission and review.**

- The author creates a repository from the starter template. Its release workflow builds `tool.zip`, attests it and uploads it.
- The author opens a pull request to the index repository with `{ id, repo, publisher }`.
- CI in the index repository checks that the repository exists and is public, that the manifest validates against the SDK schema, that the latest release has an attestation whose identity matches `repo`, that the `id` is unique and not reserved, and that the bundle size is within limits.
- The maintainer reads the pull request and merges it.

**Updates.**

- *Obsidian-style*: the app polls each author's repository directly. This hits the 60-per-hour unauthenticated API limit unless it uses `releases/latest/download/<asset>` URLs ([Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)).
- *Better (Recommendation)*: a scheduled Action in the index repository uses its authenticated token to poll listed repositories. It verifies each new release's attestation server-side and writes `version`, `sha256`, the asset URL and the bundle into the catalog. The app then fetches one file.

**Strengths.** One identity system (GitHub), a free CDN, attestations that are free and built into Actions, and a review workflow (pull requests and CI) the maintainer already uses.

**Weaknesses.**

- Release assets are mutable unless the author enables immutable releases. This is mitigated by pinning the digest in the catalog.
- Authors must use GitHub Actions on a public repository to get verifiable identity.

## Option 3: Self-hosted index

This option splits in two.

**3a. Full service** (upload API, accounts, scanning, CDN), like the VS Code Marketplace.

- *Fact*: the Marketplace scans every package with several antivirus engines before publishing. It blocks name squatting, marks verified publishers (domain ownership, and at least 6 months on the Marketplace), signs every extension on publish so VS Code can check it at install, and keeps a block list that VS Code uses to uninstall malicious extensions. Since 1.97, VS Code also asks the user to trust a new publisher ([Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security), [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)).
- *Inference*: this needs servers, storage, abuse handling and on-call time, which means money and attention a solo maintainer does not have. Rejected for v1.

**3b. Static signed index** with no server: a JSON file generated by CI and signed by the maintainer, served from GitHub Pages or as a release asset.

- *Fact*: GitHub Pages sites can be up to 1 GB with a soft limit of 100 GB per month of bandwidth ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). A catalog of metadata is tiny.
- *Inference*: this is not really a third hosting option. It is the signing layer on top of Option 1 or 2. "Self-hosted" here means the trust root, not the bytes.

**Reference: Raycast**, a centralized model that a solo maintainer cannot copy as is.

- *Fact*: authors run `npm run publish`, which opens a pull request to the `raycast/extensions` monorepo. Raycast reviews it, and "once accepted, the pull request is merged and your extension will be automatically published". Raycast's own CI builds with npm from the committed lockfile ([Publish an extension](https://developers.raycast.com/basics/publish-an-extension), [Prepare an extension for the Store](https://developers.raycast.com/basics/prepare-an-extension-for-store)).
- *Inference*: every update then needs maintainer review. That gives strong control but scales badly for one person. It also makes Power Tools the builder, so Power Tools signs code it did not write.

## Signing options

### Sigstore (keyless, identity-based)

**Fact.**

- Sigstore is free, run by OpenSSF, and has three parts. Fulcio issues short-lived certificates bound to an OIDC identity; for CI, the identity is the workflow. Rekor is an append-only transparency log. Cosign and the other clients do the signing. "Sigstore services never obtain your private key" ([Sigstore overview](https://github.com/sigstore/docs/blob/main/content/en/about/overview.md)).
- A bundle carries the certificate, the signature and a transparency-log entry with a signed entry timestamp, which proves the signature was made while the short-lived certificate was valid ([Sigstore bundle format](https://github.com/sigstore/docs/blob/main/content/en/about/bundle.md)).
- `sigstore-js` exposes `verify(bundle, payload, { certificateIssuer, certificateIdentityURI, ... })`. The identity URI is matched as a regular expression, so anchor it ([README](https://github.com/sigstore/sigstore-js/blob/main/packages/client/README.md)).
- The staging instance has no SLO, and the public-good instance publishes a status page ([public deployment](https://github.com/sigstore/docs/blob/main/content/en/cosign/system_config/public_deployment.md)).

**Version constraint (Fact).**

- `sigstore` 5.0.0, `@sigstore/verify` 4.1.2 and `@sigstore/tuf` 5.0.0 declare `node: ^22.22.2 || ^24.15.0 || >=26.0.0`.
- Electron 39.1.1 ships Node 22.21.1, and the newest 39.x (39.8.10) ships Node 22.22.1 ([Electron releases feed](https://releases.electronjs.org/releases.json)).
- `sigstore` 4.1.1 declares `^20.17.0 || >=22.9.0` (npm registry metadata).
- *Inference*: use the 4.x line, or move Electron to a version on Node 22.22.2 or later (or Node 24), before adopting 5.x.

**Offline.** Verify the stored bundle against a trusted root bundled with the app or cached by `@sigstore/tuf`. This works with no network. Revocation and key rotation are only seen when the app next goes online (see GitHub's offline notes above).

**Fit.** Strong publisher identity at zero cost for authors who build in GitHub Actions or GitLab. Weak fit for authors who build locally.

### minisign (one long-lived key)

**Fact.**

- minisign uses Ed25519 over a BLAKE2b-512 prehash. A signature file carries an untrusted comment, the signature, a *trusted comment* covered by a global signature, and an 8-byte key ID. "New implementations must use the hashed signature format" ([minisign docs](https://jedisct1.github.io/minisign/)).
- The documentation describes no key rotation or revocation.
- Implementations exist in Go, Rust, .NET, Python, Java and JavaScript ([minisign README](https://github.com/jedisct1/minisign)).
- Node `crypto` verifies Ed25519 with `verify(null, data, key, sig)` ([Node crypto](https://nodejs.org/api/crypto.html)).

**Inference.** The app can verify minisign with about 50 lines of code on top of Node `crypto` (base64 decoding, key-ID check, BLAKE2b-512, Ed25519), with no dependency. A trusted comment can carry `catalog-version=<n>` and `expires=<date>` to block rollback and freeze attacks, which are the attacks TUF is designed around ([TUF overview](https://theupdateframework.io/docs/overview/)).

**Fit.** Good for one key that the maintainer controls, such as the catalog signature. Bad for publishers: distributing and revoking each author's key falls back on the maintainer.

### Authenticode (Windows PE signing)

**Fact.**

- Authenticode signs PE and cabinet formats (`.exe`, `.dll`, `.cab`, `.ocx`) with PKCS #7 and X.509 chained to a CA in Microsoft's root program ([Time stamping Authenticode signatures](https://learn.microsoft.com/windows/win32/seccrypto/time-stamping-authenticode-signatures)).
- Azure Artifact Signing (formerly Trusted Signing) costs about $9.99 per month. For individuals it is limited to the USA and Canada. OV certificates cost $150 to $300 per year. EV certificates no longer bypass SmartScreen ([Code signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options), [Artifact Signing quickstart](https://learn.microsoft.com/azure/artifact-signing/quickstart), [SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)).
- When the installer is signed, electron-updater compares the update installer's signer DN against `publisherName` and refuses a mismatch (`verifyUpdateCodeSignature`, [electron-builder winOptions source](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/winOptions.ts)).
- electron-builder 27 (currently `27.0.0-alpha.14` on the `next` tag; `latest` is 26.18.0) adds **signed update manifests**: `latest.yml` is signed with Ed25519 and checked against a key embedded in the app, failing closed ([Signed update manifests](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/signed-update-manifests.md)).

**Inference.**

- Authenticode cannot sign a community tool's JS bundle in any way that matters, so it is not a publisher verification option here.
- It matters for the root of trust: the catalog public key and the Sigstore trusted root ship inside Power Tools. Whoever can push a Power Tools update can replace them.
- `desktop/electron-builder.json` has no signing configuration today. App updates are therefore protected by the sha512 in `latest.yml` and by HTTPS to GitHub. That is acceptable for v1, but signed update manifests (free, Ed25519) close the gap at no cost once electron-builder 27 is stable. Authenticode adds SmartScreen reputation for money.

## Comparison

| | npm + provenance | GitHub index repo + release assets | Self-hosted service | Static signed index (layer) |
|---|---|---|---|---|
| Cost | Free | Free | Servers + time | Free (Pages or release asset) |
| Curation | None built in; needs an index | Pull requests to the index repo | Built in | Generated from the index repo |
| Byte integrity | `dist.integrity` sha512 + registry ECDSA; versions immutable | Asset `digest` sha256; mutable unless immutable releases, so pin in the catalog | Own hashes | Pins the digest per version |
| Publisher identity | Sigstore provenance (workflow in repo); npm account otherwise | Sigstore artifact attestation (workflow in repo) | Accounts + domain verification | Carries the expected identity per tool |
| Offline check | Stored bundle + cached trusted root | Same | Own scheme | Ed25519 check of the cached catalog |
| Update discovery | Packument `dist-tags` per tool | Releases API (rate-limited) or catalog | Service API | One catalog fetch |
| Author effort | npm account + workflow | Template workflow only | Account on the service | None |
| Maintainer effort | Review listings | Review listings | Run a service | Keep one signing key safe |

## Recommendation

**Recommendation.** Use Option 2 for listing and bytes, Sigstore for publisher identity, and a minisign or Ed25519-signed static catalog as the trust root.

**Index repository.** `tools/<id>.json` holds `{ id, repo, repoId, publisher, workflow }`. `repoId` is the immutable GitHub repository ID, which protects against rename and reuse ([offline verification notes](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline)).

**Listing review.** A new `id`, or a change of `repo` or `workflow` (that is, a publisher change), needs a maintainer merge. Version bumps do not.

**Catalog build (scheduled Action and on merge).**

- For each tool, read the latest release with the authenticated token.
- Download `tool.zip`. Run `gh attestation verify -R <repo>` and confirm `repoId`.
- Write `version`, `url`, `sha256`, the Sigstore bundle and the manifest summary.
- Add a `revoked: [{ id, versions, reason }]` list. This is the kill switch, as in the VS Code block list.
- Add `catalogVersion` and `expires`.
- Sign the result with minisign, with the trusted comment carrying `catalogVersion` and `expires`. Publish `catalog.json` and `catalog.json.minisig`.

**App, online.**

- Fetch the catalog and verify it against the pinned public key.
- Reject a lower `catalogVersion` than the cached one, and treat an expired catalog as stale.
- To install, download the zip, check the sha256, verify the bundle with `sigstore-js` against the issuer, the repository and workflow URI, and the catalog's `repoId`, and store the zip digest and bundle.
- Updates are a diff between the catalog and the installed versions.

**App, offline.**

- Re-check installed tools against their stored digests.
- Optionally re-verify stored bundles against the bundled trusted root.
- Apply the last cached `revoked` list.

**Sideloading.** Install from a zip with an "unverified publisher" state. If the zip comes with a Sigstore bundle, show the verified repository identity instead.

**Keys.** One maintainer key, kept offline or as an Actions secret in an environment that requires approval. The app ships two public keys (current and next) so a rotation is a normal app release. Rotation follows the same pattern as electron-builder's multi-key manifests.

**Reasons this is strongest for a solo maintainer.**

- Zero spend.
- No server to run.
- One identity system (GitHub).
- Authors get verification just by using the starter template.
- The maintainer reviews only new listings and publisher changes.
- Every trust decision in the app reduces to two local checks: an Ed25519 signature and a Sigstore bundle.

npm can be added later as `source: "npm"`, using the same Sigstore path with the provenance bundle from `dist.attestations.url`.

## Open questions that could change this

- **Authors without GitHub Actions** (local builds, GitLab, or Azure DevOps). npm trusted publishing covers GitLab, and GitHub attestations do not. Decide whether such authors are "listed but unverified" or not listed at all.
- **Updates without review.** VS Code, Obsidian and npm all ship updates without manual review. Sandboxing behind the Host API limits the damage, but a permission increase in an update should probably need user consent, and perhaps maintainer re-review. Decide this in the permissions or Host API ticket.
- **Electron and Node version** for `sigstore` 5.x (see the version constraint above). Also, Electron 39 is several majors behind the current stable release (45.2.1).
- **Sigstore trusted-root refresh**: whether the app uses `@sigstore/tuf` online (one more network dependency) or ships the trusted root in each app release. The trusted root rotates a few times a year, so the shipped root needs a refresh path.
- **Catalog key custody**: whether a GitHub-hosted secret (simple, but exposed to Actions compromise) is acceptable, or the maintainer signs locally on each merge (safer, but manual). A hybrid is possible: CI signs and a short `expires` limits the damage.
- **Not verified here**: how GitHub handles attestations when a repository is transferred, and the size limits of npm tarballs for community tools. Neither should change the recommendation.
