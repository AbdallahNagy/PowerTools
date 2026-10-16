// Reads CHANGELOG.md (Keep a Changelog 1.1.0) for the release workflow,
// desktop CI, and the website changelog page.
//
// Usage:
//   node scripts/changelog.mjs check                        exit 1 if CHANGELOG.md is malformed
//   node scripts/changelog.mjs extract <version> [--out f]  print or write one release's notes
//   node scripts/changelog.mjs release <patch|minor|major|x.y.z> [--date YYYY-MM-DD]
//       move [Unreleased] into a new release, bumped from desktop/package.json,
//       and print the new version. The Prepare Release workflow runs this.
//
// --changelog <file> reads and writes another file instead of CHANGELOG.md.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UNRELEASED = "Unreleased";
export const SECTION_HEADINGS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

const RELEASE_HEADING = /^## \[([^\]]+)\](?: - (.+?))?\s*$/;
const LINK_DEFINITION = /^\[([^\]]+)\]:\s*(\S+)\s*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Splits the changelog into releases, newest first as written. Each body is the
 * Markdown between its `## [version]` heading and the next one, without the
 * trailing link definitions.
 */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const releases = [];
  const links = {};
  let current;

  for (const line of lines) {
    const heading = RELEASE_HEADING.exec(line);
    const link = LINK_DEFINITION.exec(line);
    if (heading) {
      current = { version: heading[1], date: heading[2], lines: [] };
      releases.push(current);
    } else if (link) {
      links[link[1]] = link[2];
    } else if (current) {
      current.lines.push(line);
    }
  }

  return {
    releases: releases.map(({ version, date, lines: body }) => ({
      version,
      date,
      body: body.join("\n").trim(),
    })),
    links,
  };
}

function parseSemver(version) {
  const match = SEMVER.exec(version);
  if (!match) return undefined;
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? [] };
}

/** Semantic Versioning precedence: negative when a < b. */
export function compareVersions(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return Number(x) - Number(y);
    if (xNum !== yNum) return xNum ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Returns a list of problems. An empty list means the changelog is valid. */
export function validateChangelog(text) {
  const { releases, links } = parseChangelog(text);
  const problems = [];

  if (releases[0]?.version !== UNRELEASED) {
    problems.push(`The first section must be "## [${UNRELEASED}]".`);
  }

  releases.forEach((release, index) => {
    const label = `[${release.version}]`;
    if (release.version === UNRELEASED) {
      if (index !== 0) problems.push(`${label} must be the first section.`);
      if (release.date) problems.push(`${label} must not have a date.`);
    } else {
      if (!parseSemver(release.version)) problems.push(`${label} is not a semantic version.`);
      if (!release.date || !ISO_DATE.test(release.date)) {
        problems.push(`${label} needs a date in YYYY-MM-DD form.`);
      }
      if (!release.body) problems.push(`${label} has no notes.`);
    }
    if (!links[release.version]) problems.push(`${label} has no link definition at the end of the file.`);

    for (const line of release.body.split("\n")) {
      const subheading = /^###\s+(.*)$/.exec(line);
      if (subheading && !SECTION_HEADINGS.includes(subheading[1].trim())) {
        problems.push(`${label} uses "### ${subheading[1]}". Use one of: ${SECTION_HEADINGS.join(", ")}.`);
      }
    }
  });

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^## /.test(line) && !RELEASE_HEADING.test(line)) {
      problems.push(`"${line}" is not a release heading. Use "## [x.y.z] - YYYY-MM-DD".`);
    }
  }

  const versions = releases.map((r) => r.version).filter((v) => v !== UNRELEASED && parseSemver(v));
  const seen = new Set();
  versions.forEach((version, index) => {
    if (seen.has(version)) problems.push(`[${version}] appears more than once.`);
    seen.add(version);
    const next = versions[index + 1];
    if (next && compareVersions(version, next) <= 0) {
      problems.push(`[${version}] must come after [${next}]. List releases newest first.`);
    }
  });

  return problems;
}

/** The GitHub release body for one version, or undefined if it has no notes. */
export function releaseNotes(text, version) {
  const release = parseChangelog(text).releases.find((r) => r.version === version);
  if (!release?.body) return undefined;
  return `# Power Tools ${version}\n\n${release.body}\n`;
}

/** The version after `current` for a patch, minor, or major bump, or an exact x.y.z. */
export function nextVersion(current, bump) {
  const parsed = parseSemver(current);
  if (!parsed) throw new Error(`"${current}" is not a semantic version.`);
  const [major, minor, patch] = parsed.core;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return parsed.pre.length ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
  const exact = bump?.replace(/^v/, "");
  if (exact && parseSemver(exact)) return exact;
  throw new Error(`Use patch, minor, major, or an exact version, not "${bump}".`);
}

/**
 * Moves the [Unreleased] notes into a new "## [version] - date" section, leaves
 * an empty [Unreleased] above it, and updates the compare links.
 */
export function cutRelease(text, version, date) {
  const normalized = text.replace(/\r\n/g, "\n");
  const { releases } = parseChangelog(normalized);
  const unreleased = releases.find((r) => r.version === UNRELEASED);
  const latest = releases.find((r) => r.version !== UNRELEASED);

  if (!unreleased) throw new Error(`CHANGELOG.md has no "## [${UNRELEASED}]" section.`);
  if (!/^\s*[-*] /m.test(unreleased.body)) {
    throw new Error(`[${UNRELEASED}] has no entries. Add what changed before cutting ${version}.`);
  }
  if (!parseSemver(version)) throw new Error(`"${version}" is not a semantic version.`);
  if (!ISO_DATE.test(date)) throw new Error(`"${date}" is not a YYYY-MM-DD date.`);
  if (latest && compareVersions(version, latest.version) <= 0) {
    throw new Error(`${version} must be higher than the latest release, ${latest.version}.`);
  }

  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => RELEASE_HEADING.exec(line)?.[1] === UNRELEASED);
  lines.splice(headingIndex, 1, `## [${UNRELEASED}]`, "", `## [${version}] - ${date}`);

  const linkIndex = lines.findIndex((line) => LINK_DEFINITION.exec(line)?.[1] === UNRELEASED);
  const compare = linkIndex === -1 ? undefined : /^(.*)\/compare\/(\S+)\.\.\.HEAD$/.exec(LINK_DEFINITION.exec(lines[linkIndex])[2]);
  if (!compare) {
    throw new Error(`The [${UNRELEASED}] link must look like "[${UNRELEASED}]: <repo>/compare/v<latest>...HEAD".`);
  }
  const [, repo, previous] = compare;
  lines.splice(
    linkIndex,
    1,
    `[${UNRELEASED}]: ${repo}/compare/v${version}...HEAD`,
    `[${version}]: ${repo}/compare/${previous}...v${version}`,
  );

  return lines.join("\n");
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const changelogPath = resolve(optionValue(args, "--changelog") ?? join(root, "CHANGELOG.md"));
  const text = readFileSync(changelogPath, "utf8");
  const [command, version] = args;

  if (command === "release" && version) {
    const { version: current } = JSON.parse(readFileSync(join(root, "desktop", "package.json"), "utf8"));
    const date = optionValue(args, "--date") ?? new Date().toISOString().slice(0, 10);
    try {
      const next = nextVersion(current, version);
      const updated = cutRelease(text, next, date);
      const problems = validateChangelog(updated);
      if (problems.length) throw new Error(problems.join("\n"));
      writeFileSync(changelogPath, updated);
      process.stdout.write(`${next}\n`);
      return 0;
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }

  if (command === "check") {
    const problems = validateChangelog(text);
    if (problems.length) {
      console.error(`CHANGELOG.md has ${problems.length} problem(s):`);
      for (const problem of problems) console.error(`- ${problem}`);
      return 1;
    }
    console.log("CHANGELOG.md is valid.");
    return 0;
  }

  if (command === "extract" && version) {
    const notes = releaseNotes(text, version.replace(/^v/, ""));
    if (!notes) {
      console.error(`CHANGELOG.md has no notes for ${version}. Add a "## [${version}] - YYYY-MM-DD" section.`);
      return 1;
    }
    const out = optionValue(args, "--out");
    if (out) {
      writeFileSync(resolve(out), notes);
    } else {
      process.stdout.write(notes);
    }
    return 0;
  }

  console.error(
    "Usage: node scripts/changelog.mjs check | extract <version> [--out <file>] | release <patch|minor|major|x.y.z> [--date YYYY-MM-DD]",
  );
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
