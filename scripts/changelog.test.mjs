import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  compareVersions,
  cutRelease,
  nextVersion,
  parseChangelog,
  releaseNotes,
  validateChangelog,
} from "./changelog.mjs";

const valid = `# Changelog

## [Unreleased]

### Added

- Something new.

## [1.1.0] - 2026-11-01

### Fixed

- A bug.

## [1.1.0-beta.1] - 2026-10-20

### Changed

- A tweak.

[Unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.1.0-beta.1...v1.1.0
[1.1.0-beta.1]: https://example.com/releases/tag/v1.1.0-beta.1
`;

test("parses releases and link definitions", () => {
  const { releases, links } = parseChangelog(valid.replace(/\n/g, "\r\n"));
  assert.deepEqual(
    releases.map(({ version, date }) => ({ version, date })),
    [
      { version: "Unreleased", date: undefined },
      { version: "1.1.0", date: "2026-11-01" },
      { version: "1.1.0-beta.1", date: "2026-10-20" },
    ],
  );
  assert.equal(releases[1].body, "### Fixed\n\n- A bug.");
  assert.ok(!releases[2].body.includes("example.com"));
  assert.equal(links["1.1.0"], "https://example.com/compare/v1.1.0-beta.1...v1.1.0");
});

test("extracts release notes with a title", () => {
  assert.equal(releaseNotes(valid, "1.1.0"), "# Power Tools 1.1.0\n\n### Fixed\n\n- A bug.\n");
  assert.equal(releaseNotes(valid, "9.9.9"), undefined);
});

test("orders versions by semantic versioning precedence", () => {
  assert.ok(compareVersions("1.0.0", "1.0.0-beta.5") > 0);
  assert.ok(compareVersions("0.1.0-beta.10", "0.1.0-beta.2") > 0);
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.equal(compareVersions("1.0.1", "1.0.1"), 0);
});

test("accepts a valid changelog", () => {
  assert.deepEqual(validateChangelog(valid), []);
});

test("reports common mistakes", () => {
  const broken = valid
    .replace("## [1.1.0] - 2026-11-01", "## [1.1.0] - Nov 1")
    .replace("### Fixed", "### Bug fixes")
    .replace("[1.1.0-beta.1]: https://example.com/releases/tag/v1.1.0-beta.1\n", "");
  const problems = validateChangelog(broken);
  assert.ok(problems.some((p) => p.includes("[1.1.0] needs a date")));
  assert.ok(problems.some((p) => p.includes('"### Bug fixes"')));
  assert.ok(problems.some((p) => p.includes("[1.1.0-beta.1] has no link definition")));
});

test("requires Unreleased first and releases newest first", () => {
  const swapped = `## [1.0.0] - 2026-01-01\n\n- A.\n\n## [Unreleased]\n\n## [1.1.0] - 2026-02-01\n\n- B.\n\n[Unreleased]: x\n[1.0.0]: x\n[1.1.0]: x\n`;
  const problems = validateChangelog(swapped);
  assert.ok(problems.some((p) => p.includes('first section must be "## [Unreleased]"')));
  assert.ok(problems.some((p) => p.includes("[1.0.0] must come after [1.1.0]")));
});

test("the repository changelog is valid", () => {
  const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  assert.deepEqual(validateChangelog(text), []);
});

test("reports headings that are not release headings", () => {
  const problems = validateChangelog(valid.replace("## [1.1.0] - 2026-11-01", "## 1.1.0"));
  assert.ok(problems.some((p) => p.includes('"## 1.1.0" is not a release heading')));
});

test("bumps versions", () => {
  assert.equal(nextVersion("1.0.1", "patch"), "1.0.2");
  assert.equal(nextVersion("1.0.1", "minor"), "1.1.0");
  assert.equal(nextVersion("1.0.1", "major"), "2.0.0");
  assert.equal(nextVersion("1.1.0-beta.1", "patch"), "1.1.0");
  assert.equal(nextVersion("1.0.1", "v1.2.3"), "1.2.3");
  assert.throws(() => nextVersion("1.0.1", "huge"), /patch, minor, major/);
});

test("cuts a release from Unreleased", () => {
  const cut = cutRelease(valid, "1.2.0", "2026-12-01");
  assert.deepEqual(validateChangelog(cut), []);

  const { releases, links } = parseChangelog(cut);
  assert.deepEqual(
    releases.slice(0, 3).map(({ version, date }) => ({ version, date })),
    [
      { version: "Unreleased", date: undefined },
      { version: "1.2.0", date: "2026-12-01" },
      { version: "1.1.0", date: "2026-11-01" },
    ],
  );
  assert.equal(releases[0].body, "");
  assert.equal(releases[1].body, "### Added\n\n- Something new.");
  assert.equal(links.Unreleased, "https://example.com/compare/v1.2.0...HEAD");
  assert.equal(links["1.2.0"], "https://example.com/compare/v1.1.0...v1.2.0");
});

test("refuses to cut an empty or lower release", () => {
  const empty = cutRelease(valid, "1.2.0", "2026-12-01");
  assert.throws(() => cutRelease(empty, "1.3.0", "2026-12-02"), /has no entries/);
  assert.throws(() => cutRelease(valid, "1.0.0", "2026-12-01"), /must be higher/);
});
