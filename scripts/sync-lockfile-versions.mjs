// Keeps each workspace version in bun.lock equal to its package.json version.
//
// `changeset version` bumps packages/*/package.json but leaves bun.lock alone,
// and Bun before 1.4.1 only rewrites a workspace's lock version when one of its
// dependency entries changes too — so `bun install --lockfile-only` alone does
// not fix a version-only bump on the pinned Bun. `--frozen-lockfile` does not
// notice the mismatch either, so the lock drifts silently.
//
//   node scripts/sync-lockfile-versions.mjs          # rewrite bun.lock
//   node scripts/sync-lockfile-versions.mjs --check  # fail on any mismatch
//
// Edits the version line in place rather than re-serialising, so the rest of
// the file stays byte-for-byte what Bun wrote.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOCKFILE = "bun.lock";
const check = process.argv.includes("--check");

const original = readFileSync(LOCKFILE, "utf8");
// bun.lock is JSON with trailing commas.
const lock = JSON.parse(original.replace(/,(\s*[}\]])/g, "$1"));

let text = original;
const mismatches = [];

for (const [dir, entry] of Object.entries(lock.workspaces ?? {})) {
  // The root workspace's version is not recorded in the lock.
  if (dir === "") continue;

  const { version } = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  if (version === undefined || entry.version === version) continue;

  mismatches.push({ dir, lock: entry.version, pkg: version });
  if (check) continue;

  const header = new RegExp(
    `(\\n    ${JSON.stringify(dir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: \\{\\n(?:      [^\\n]*\\n)*?      "version": )"[^"\\n]*"`,
  );
  if (!header.test(text)) {
    console.error(`${LOCKFILE}: no version line found for workspace ${dir}`);
    process.exit(1);
  }
  text = text.replace(header, `$1${JSON.stringify(version)}`);
}

if (check) {
  for (const { dir, lock: locked, pkg } of mismatches) {
    console.error(
      `${LOCKFILE} records ${dir} at ${locked ?? "(no version)"}, but ${dir}/package.json is ${pkg}`,
    );
  }
  if (mismatches.length > 0) {
    console.error("Run `node scripts/sync-lockfile-versions.mjs` to fix.");
    process.exit(1);
  }
} else if (text !== original) {
  writeFileSync(LOCKFILE, text);
  for (const { dir, lock: locked, pkg } of mismatches) {
    console.log(`${LOCKFILE}: ${dir} ${locked} -> ${pkg}`);
  }
}
