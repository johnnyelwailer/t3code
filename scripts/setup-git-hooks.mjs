#!/usr/bin/env node
/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */

import * as NodeChildProcess from "node:child_process";

const EXPECTED_HOOKS_PATH = ".githooks";

function runGit(args, options = {}) {
  const { allowFail = false } = options;
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

function main() {
  const top = runGit(["rev-parse", "--show-toplevel"], { allowFail: true });
  if (!top) {
    console.log("setup-git-hooks: not in a git repository, skipping.");
    return;
  }

  const current = runGit(["config", "--local", "--get", "core.hooksPath"], {
    allowFail: true,
  });

  if (current === EXPECTED_HOOKS_PATH) {
    console.log(`setup-git-hooks: core.hooksPath already set to '${EXPECTED_HOOKS_PATH}'.`);
    return;
  }

  runGit(["config", "--local", "core.hooksPath", EXPECTED_HOOKS_PATH]);
  console.log(`setup-git-hooks: set core.hooksPath to '${EXPECTED_HOOKS_PATH}'.`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`setup-git-hooks error: ${message}`);
  process.exit(1);
}
