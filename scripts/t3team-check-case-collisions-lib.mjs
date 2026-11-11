// Shared helpers for the case-collision check. Keep in sync with hive/nx-nexi dev/scripts/check-case-collisions-lib.mjs.

import { spawnSync } from "node:child_process";
import { dirname, posix } from "node:path";

const MODULE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const RESOLVE_EXT = [...MODULE_EXT, ".json"];
const IMPORT_RE =
  /\b(?:import|export)(?:\s+type)?\s+(?:[^'"\n]*?\sfrom\s+)?["'](\.\.?\/[^"']+)["']|\b(?:import|require)\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;

export const fold = (path) => path.normalize("NFC").toLowerCase();
const extname = (path) => {
  const i = posix.basename(path).lastIndexOf(".");
  return i <= 0 ? "" : posix.basename(path).slice(i);
};
const stemPath = (path) =>
  posix.join(
    posix.dirname(path),
    posix.basename(path).slice(0, -extname(path).length || undefined) || posix.basename(path),
  );
const skipped = (path) => path.split("/").some((p) => p === ".repos" || p === "node_modules");

function groupBy(paths, keyFn) {
  const groups = new Map();
  for (const path of paths) {
    const key = keyFn(path);
    const list = groups.get(key);
    if (list) list.push(path);
    else groups.set(key, [path]);
  }
  return [...groups.values()]
    .map((list) => [...new Set(list)].sort())
    .filter((list) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export const findCaseCollisions = (paths) => groupBy(paths, fold);

export function findStemCollisions(paths) {
  const modules = paths.filter((path) => MODULE_EXT.has(extname(path)) && !skipped(path));
  return groupBy(modules, (path) => fold(stemPath(path))).filter(
    (list) => new Set(list.map(stemPath)).size > 1,
  );
}

export function resolveRelativeSpecifier(fromPath, specifier, byFold) {
  const raw = specifier.split(/[?#]/, 1)[0];
  const baseDir = dirname(fromPath).replaceAll("\\", "/");
  const resolved = posix.normalize(posix.join(baseDir === "." ? "" : baseDir, raw));
  const candidates = extname(raw)
    ? [resolved]
    : [
        resolved,
        ...RESOLVE_EXT.flatMap((ext) => [resolved + ext, posix.join(resolved, "index" + ext)]),
      ];
  const matches = new Map();
  for (const candidate of candidates) {
    for (const path of byFold.get(fold(candidate)) ?? []) matches.set(path, candidate);
  }
  return { resolved, matches: [...matches.entries()] };
}

export function findCaseMismatchedImports(paths, read) {
  const byFold = new Map();
  for (const path of paths) {
    const key = fold(path);
    const list = byFold.get(key);
    if (list) list.push(path);
    else byFold.set(key, [path]);
  }
  const findings = [];
  for (const file of paths) {
    if (!MODULE_EXT.has(extname(file)) || skipped(file)) continue;
    let source;
    try {
      source = read(file);
    } catch {
      continue;
    }
    IMPORT_RE.lastIndex = 0;
    for (let match; (match = IMPORT_RE.exec(source));) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const { matches } = resolveRelativeSpecifier(file, specifier, byFold);
      if (matches.length === 0) continue;
      const uniqueTracked = [...new Set(matches.map(([tracked]) => tracked))];
      const exact = uniqueTracked.filter((tracked) =>
        matches.some(([path, candidate]) => path === tracked && path === candidate),
      );
      if (uniqueTracked.length > 1 || exact.length === 0) {
        findings.push({
          file,
          line: source.slice(0, match.index).split("\n").length,
          specifier,
          tracked: uniqueTracked.sort(),
        });
      }
    }
  }
  return findings;
}

export const parseAllowlist = (text) =>
  new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );

export const rejectAllowed = (groups, allow) =>
  allow.size ? groups.filter((group) => group.some((path) => !allow.has(path))) : groups;

export function parseArgs(argv) {
  const opts = {
    recurseSubmodules: false,
    imports: false,
    trees: [],
    allowFile: null,
    help: false,
  };
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

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || `git ${args.join(" ")} exited ${result.status}`).trim(),
    );
  }
  return result.stdout;
}

export const listTrackedPaths = ({ cwd = process.cwd(), recurseSubmodules = false } = {}) =>
  runGit(["ls-files", "-z", ...(recurseSubmodules ? ["--recurse-submodules"] : [])], cwd)
    .split("\0")
    .filter(Boolean);

export function listTreePaths(sha, prefix, cwd = process.cwd()) {
  const base = prefix.replace(/\/$/, "");
  return runGit(["ls-tree", "-r", "--name-only", sha], cwd)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => (base ? `${base}/${path}` : path));
}
