#!/usr/bin/env node
// t3team hot-file warning: flags a branch that adds lines to hot files the upstream
// redesign stack (#28839..#28845) rewrites. WARNING ONLY — always exits 0.
// Usage: node scripts/t3team-hot-file-check.mjs [baseRef] [headRef]
//   baseRef defaults to origin/main (then main), headRef to HEAD.
// See docs/UPSTREAM-ALIGNMENT.md for the rules; the file list lives in
// scripts/t3team-hot-files.json.

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

// Run from the repository root.
const repoRoot = process.cwd();

function runGit(args) {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function resolveBaseRef() {
  for (const candidate of ["origin/main", "main"]) {
    try {
      runGit(["rev-parse", "--verify", `${candidate}^{commit}`]);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function main() {
  const headRef = process.argv[3] ?? "HEAD";
  const baseRef = process.argv[2] ?? resolveBaseRef();
  if (!baseRef) {
    console.log("[hot-file] no base ref found (tried origin/main, main); skipping.");
    return;
  }

  const listPath = NodePath.join(repoRoot, "scripts", "t3team-hot-files.json");
  let config;
  try {
    config = JSON.parse(NodeFS.readFileSync(listPath, "utf8"));
  } catch {
    console.log("[hot-file] scripts/t3team-hot-files.json missing; skipping.");
    return;
  }

  const numstat = runGit(["diff", "--numstat", `${baseRef}...${headRef}`]);
  const hotPaths = new Set(config.files);
  const hits = new Map();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [additionsRaw, , pathRaw] = line.split("\t");
    const additions = additionsRaw === "-" ? 0 : Number.parseInt(additionsRaw, 10) || 0;
    if (!pathRaw || additions === 0) continue;
    // numstat renders renames as "old => new"; match either side.
    const paths = pathRaw.includes(" => ")
      ? pathRaw.split(" => ").map((part) => part.trim())
      : [pathRaw];
    for (const path of paths) {
      if (hotPaths.has(path)) {
        hits.set(path, (hits.get(path) ?? 0) + additions);
      }
    }
  }

  const threshold = config.thresholdAddedLines;
  let warned = 0;
  for (const [path, additions] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
    if (additions > threshold) {
      warned += 1;
      console.warn(
        `[hot-file] WARNING: ${path} gains ${additions} lines (> ${threshold}). ` +
          `Hot-file rule: thin hooks only (one-line import + call); move the logic to a t3team-* file. ` +
          `See docs/UPSTREAM-ALIGNMENT.md.`,
      );
    }
  }
  if (warned === 0) {
    const touched = [...hits.keys()];
    console.log(
      `[hot-file] ok: ${
        touched.length === 0
          ? "no hot files touched"
          : `hot-file additions within the ${threshold}-line budget: ${touched.join(", ")}`
      } (${baseRef}...${headRef}).`,
    );
  }
}

main();
