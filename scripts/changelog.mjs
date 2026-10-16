#!/usr/bin/env node
// Reads CHANGELOG.md (Keep a Changelog 1.1.0) for the release workflow,
// desktop CI, and the website changelog page.
//
// Usage:
//   node scripts/changelog.mjs check                        exit 1 if CHANGELOG.md is malformed
//   node scripts/changelog.mjs extract <version> [--out f]  print or write one release's notes

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

function main(args) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const text = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const [command, version] = args;

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
    const outIndex = args.indexOf("--out");
    if (outIndex !== -1 && args[outIndex + 1]) {
      writeFileSync(resolve(args[outIndex + 1]), notes);
    } else {
      process.stdout.write(notes);
    }
    return 0;
  }

  console.error("Usage: node scripts/changelog.mjs check | extract <version> [--out <file>]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
