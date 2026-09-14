#!/usr/bin/env node
/**
 * dev-nexi — start the dev stack with the full Nexi distribution.
 *
 * Usage:
 *   pnpm dev:nexi                      # default worktree (cwd)
 *   pnpm dev:nexi /path/to/worktree    # custom t3code worktree
 *
 * The distribution path is read from T3CODE_DISTRIBUTION, defaulting to
 * the well-known Nexi global pack. Override with:
 *   T3CODE_DISTRIBUTION=/other/path node scripts/dev-nexi.ts
 */
import { execFileSync, spawn } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const DEFAULT_DISTRIBUTION = "/Users/pj/Dev/github/nexi-distribution/shared/packs/nexplore-global";

// Resolve the worktree: arg[2] (after "node" and the script path) or cwd.
const worktreeArg = process.argv[2]?.trim();
const worktreeDir = worktreeArg ? NodePath.resolve(worktreeArg) : process.cwd();

if (!NodeFS.existsSync(NodePath.join(worktreeDir, "package.json"))) {
  console.error(`dev-nexi: no package.json in ${worktreeDir} — is this a t3code checkout?`);
  process.exit(1);
}

const distribution = process.env.T3CODE_DISTRIBUTION?.trim() || DEFAULT_DISTRIBUTION;
if (!NodeFS.existsSync(NodePath.join(distribution, "distribution.json"))) {
  console.error(`dev-nexi: distribution.json not found in ${distribution}`);
  console.error(`Set T3CODE_DISTRIBUTION to a valid distribution directory.`);
  process.exit(1);
}

const devRunner = NodePath.join(worktreeDir, "scripts", "dev-runner.ts");
if (!NodeFS.existsSync(devRunner)) {
  console.error(`dev-nexi: dev-runner not found at ${devRunner}`);
  process.exit(1);
}

const env = {
  ...process.env,
  T3CODE_DISTRIBUTION: distribution,
  T3CODE_HOME: process.env.T3CODE_HOME || NodePath.join(process.env.HOME || "", ".t3"),
};

// Resolve the node binary from the same runtime the dev-runner would use.
const nodeBin = process.execPath;

const args = [devRunner, "dev", ...process.argv.slice(3)];

console.log(`dev-nexi: worktree=${worktreeDir}`);
console.log(`dev-nexi: distribution=${distribution}`);
console.log(`dev-nexi: T3CODE_HOME=${env.T3CODE_HOME}`);

const child = spawn(nodeBin, args, {
  cwd: worktreeDir,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(`dev-nexi: failed to start dev-runner: ${err.message}`);
  process.exit(1);
});
