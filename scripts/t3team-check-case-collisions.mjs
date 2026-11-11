#!/usr/bin/env node
// Fail when tracked paths would clash on a case-insensitive file system:
//   * two full paths that differ only by case
//   * two files in the same directory whose names, without extension, differ only by case
//     (the #879 class: Ensure.tsx next to ensure.ts, so import "./Ensure" resolves to the .ts file)
//   * a relative import specifier whose case does not match the tracked file
//
//   node check-case-collisions.mjs [--recurse-submodules] [--imports] [--ls-tree prefix:sha]...
//
// No dependencies. Exit 0 if clean, 1 if a collision or specifier mismatch is found, 2 on usage/git errors.
// Keep this file in sync between:
//   johnnyelwailer/t3code  scripts/t3team-check-case-collisions.mjs
//   hive/nx-nexi           dev/scripts/check-case-collisions.mjs

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const MODULE_EXT = SOURCE_EXT;
const RESOLVE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json"];
const IMPORT_RE =
  /\b(?:import|export)(?:\s+type)?\s+(?:[^'"\n]*?\sfrom\s+)?["'](\.\.?\/[^"']+)["']|\b(?:import|require)\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;

export function fold(path) {
  return path.normalize("NFC").toLowerCase();
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

function groupBy(paths, keyFn) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const path of paths) {
    const key = keyFn(path);
    const list = groups.get(key);
    if (list) list.push(path);
    else groups.set(key, [path]);
  }
  return [...groups.values()]
    .map((list) => uniqueSorted(list))
    .filter((list) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Two tracked paths that differ only by case, including the extension. */
export function findCaseCollisions(paths) {
  return groupBy(paths, fold);
}

function stemPath(path) {
  return posix.join(posix.dirname(path), stripExt(posix.basename(path)));
}

function isSkippedTreePath(path) {
  const parts = path.split("/");
  return parts.includes(".repos") || parts.includes("node_modules");
}

/**
 * Module files in the same directory whose names collide case-insensitively once
 * the extension is removed, and whose stems are not already the same case
 * (foo.ts next to foo.tsx is left alone; Foo.ts next to foo.tsx is not).
 * .css/.md and similar are ignored: an extensionless TS import does not resolve to them.
 */
export function findStemCollisions(paths) {
  const modules = paths.filter((path) => MODULE_EXT.has(extname(path)) && !isSkippedTreePath(path));
  return groupBy(modules, (path) => fold(stemPath(path))).filter((list) => {
    const stems = new Set(list.map((path) => stemPath(path)));
    return stems.size > 1;
  });
}

function extname(path) {
  const base = posix.basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i);
}

function stripExt(path) {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

function isSkippedImportFile(path) {
  return isSkippedTreePath(path);
}

/**
 * Resolve a relative specifier against fromPath, returning every tracked path
 * that matches case-insensitively, plus the exact-case path the specifier names.
 * @param {string} fromPath
 * @param {string} specifier
 * @param {Map<string, string[]>} byFold
 */
export function resolveRelativeSpecifier(fromPath, specifier, byFold) {
  const [raw, queryHash] = specifier.split(/(?=[?#])/);
  void queryHash;
  const baseDir = dirname(fromPath).replaceAll("\\", "/");
  const resolved = posix.normalize(posix.join(baseDir === "." ? "" : baseDir, raw));
  const hasExt = extname(raw) !== "";
  const candidates = hasExt
    ? [resolved]
    : [
        resolved,
        ...RESOLVE_EXT.map((ext) => resolved + ext),
        ...RESOLVE_EXT.map((ext) => posix.join(resolved, "index" + ext)),
      ];
  /** @type {Map<string, string>} exactPath -> first matching tracked path (any case) */
  const matches = new Map();
  for (const candidate of candidates) {
    const tracked = byFold.get(fold(candidate));
    if (!tracked) continue;
    for (const path of tracked) matches.set(path, candidate);
  }
  return { resolved, matches: [...matches.entries()] };
}

/**
 * @param {string[]} paths
 * @param {(path: string) => string} read
 */
export function findCaseMismatchedImports(paths, read) {
  const byFold = new Map();
  for (const path of paths) {
    const key = fold(path);
    const list = byFold.get(key);
    if (list) list.push(path);
    else byFold.set(key, [path]);
  }

  /** @type {{ file: string, line: number, specifier: string, tracked: string[] }[]} */
  const findings = [];
  for (const file of paths) {
    if (!SOURCE_EXT.has(extname(file)) || isSkippedImportFile(file)) continue;
    let source;
    try {
      source = read(file);
    } catch {
      continue;
    }
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(source))) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const { matches } = resolveRelativeSpecifier(file, specifier, byFold);
      if (matches.length === 0) continue;
      const uniqueTracked = [...new Set(matches.map(([tracked]) => tracked))];
      const exactTracked = uniqueTracked.filter((tracked) =>
        matches.some(([path, candidate]) => path === tracked && path === candidate),
      );
      // Wrong if the specifier matches no path at the exact case, or matches two
      // tracked files that differ only by case (the #879 class, also reported as a path collision).
      if (uniqueTracked.length > 1 || exactTracked.length === 0) {
        const line = source.slice(0, match.index).split("\n").length;
        findings.push({ file, line, specifier, tracked: uniqueTracked.sort() });
      }
    }
  }
  return findings;
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || `git ${args.join(" ")} exited ${result.status}`).trim();
    throw new Error(err);
  }
  return result.stdout;
}

export function listTrackedPaths({ cwd = process.cwd(), recurseSubmodules = false } = {}) {
  const args = ["ls-files", "-z"];
  if (recurseSubmodules) args.push("--recurse-submodules");
  const out = runGit(args, cwd);
  return out.split("\0").filter(Boolean);
}

export function listTreePaths(sha, prefix, cwd = process.cwd()) {
  const out = runGit(["ls-tree", "-r", "--name-only", sha], cwd);
  const base = prefix.replace(/\/$/, "");
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => (base ? `${base}/${path}` : path));
}

export function formatReport({ collisions, stems, imports }) {
  const lines = [];
  if (collisions.length) {
    lines.push("Case-insensitive path collisions (these cannot both exist on macOS or Windows):");
    for (const group of collisions) {
      lines.push("");
      for (const path of group) lines.push(`  ${path}`);
    }
  }
  if (stems.length) {
    if (lines.length) lines.push("");
    lines.push("Files in the same directory whose names differ only by case once the extension is removed.");
    lines.push("On macOS or Windows, an extensionless import can resolve to the wrong file:");
    for (const group of stems) {
      lines.push("");
      for (const path of group) lines.push(`  ${path}`);
    }
  }
  if (imports.length) {
    if (lines.length) lines.push("");
    lines.push("Import specifier case does not match the tracked file:");
    lines.push("");
    for (const item of imports) {
      const tracked = item.tracked.join(", ");
      lines.push(`  ${item.file}:${item.line}  import "${item.specifier}"  (tracked as ${tracked})`);
    }
  }
  return lines.join("\n");
}

export function parseAllowlist(text) {
  return new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/** A known group is suppressed only when every path in it is allowlisted. A new sibling still fails. */
export function rejectAllowed(groups, allow) {
  if (!allow.size) return groups;
  return groups.filter((group) => group.some((path) => !allow.has(path)));
}

export function parseArgs(argv) {
  const opts = { recurseSubmodules: false, imports: false, trees: [], allowFile: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--recurse-submodules") opts.recurseSubmodules = true;
    else if (arg === "--imports") opts.imports = true;
    else if (arg === "--allow") {
      const value = argv[++i];
      if (!value) throw new Error("--allow expects a file path");
      opts.allowFile = value;
    } else if (arg === "--ls-tree") {
      const value = argv[++i];
      if (!value || !value.includes(":")) throw new Error("--ls-tree expects prefix:sha");
      const idx = value.indexOf(":");
      opts.trees.push({ prefix: value.slice(0, idx), sha: value.slice(idx + 1) });
    } else if (arg === "-h" || arg === "--help") opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function main(argv, { cwd = process.cwd(), log = console, read } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    log.error(String(error.message ?? error));
    return 2;
  }
  if (opts.help) {
    log.log(`Usage: node check-case-collisions.mjs [--recurse-submodules] [--imports] [--allow file] [--ls-tree prefix:sha]...`);
    return 0;
  }

  let paths;
  try {
    paths = listTrackedPaths({ cwd, recurseSubmodules: opts.recurseSubmodules });
    for (const tree of opts.trees) {
      paths.push(...listTreePaths(tree.sha, tree.prefix, cwd));
    }
  } catch (error) {
    log.error(String(error.message ?? error));
    return 2;
  }

  const unique = [...new Set(paths)];
  let allow = new Set();
  if (opts.allowFile) {
    try {
      allow = parseAllowlist(readFileSync(opts.allowFile.startsWith("/") ? opts.allowFile : `${cwd}/${opts.allowFile}`, "utf8"));
    } catch (error) {
      log.error(`cannot read --allow file: ${error.message ?? error}`);
      return 2;
    }
  }
  const collisions = rejectAllowed(findCaseCollisions(unique), allow);
  const stems = rejectAllowed(findStemCollisions(unique), allow);
  const imports = opts.imports ? findCaseMismatchedImports(unique, read) : [];

  if (collisions.length || stems.length || imports.length) {
    log.error(formatReport({ collisions, stems, imports }));
    log.error("");
    log.error(
      `Found ${collisions.length} path collision(s), ${stems.length} extensionless-name collision(s), and ${imports.length} import specifier case mismatch(es).`,
    );
    return 1;
  }
  const extra = opts.imports ? ", including relative import specifiers" : "";
  log.log(`OK: ${unique.length} tracked path(s), no case-insensitive collisions${extra}.`);
  return 0;
}

// Fix default file reader: read from the working tree, not a file URL base edge case.
function readFromCwd(cwd, path) {
  return readFileSync(`${cwd}/${path}`, "utf8");
}

export function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const read = options.read ?? ((path) => readFromCwd(cwd, path));
  return main(argv, { ...options, cwd, read });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = run(process.argv.slice(2));
