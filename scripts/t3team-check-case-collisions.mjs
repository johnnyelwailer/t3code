#!/usr/bin/env node
// Case-insensitive path / stem / relative-import collisions. No deps. Exit 0/1/2.
// Keep in sync: fork scripts/t3team-check-case-collisions*.mjs and hive/nx-nexi dev/scripts/check-case-collisions*.mjs

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import {
  findCaseCollisions,
  findCaseMismatchedImports,
  findStemCollisions,
  listTrackedPaths,
  listTreePaths,
  parseAllowlist,
  rejectAllowed,
} from "./t3team-check-case-collisions-lib.mjs";

export {
  findCaseCollisions,
  findCaseMismatchedImports,
  findStemCollisions,
  fold,
  listTrackedPaths,
  listTreePaths,
  parseAllowlist,
  rejectAllowed,
  resolveRelativeSpecifier,
} from "./t3team-check-case-collisions-lib.mjs";

export function formatReport({ collisions, stems, imports }) {
  const lines = [];
  const block = (title, groups) => {
    if (!groups.length) return;
    if (lines.length) lines.push("");
    lines.push(title);
    for (const group of groups) {
      lines.push("");
      for (const path of group) lines.push(`  ${path}`);
    }
  };
  block(
    "Case-insensitive path collisions (these cannot both exist on macOS or Windows):",
    collisions,
  );
  block(
    "Files in the same directory whose names differ only by case once the extension is removed.\nOn macOS or Windows, an extensionless import can resolve to the wrong file:",
    stems,
  );
  if (imports.length) {
    if (lines.length) lines.push("");
    lines.push("Import specifier case does not match the tracked file:", "");
    for (const item of imports) {
      lines.push(
        `  ${item.file}:${item.line}  import "${item.specifier}"  (tracked as ${item.tracked.join(", ")})`,
      );
    }
  }
  return lines.join("\n");
}

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

function main(argv, { cwd, log, read }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    log.error(String(error.message ?? error));
    return 2;
  }
  if (opts.help) {
    log.log(
      "Usage: node check-case-collisions.mjs [--recurse-submodules] [--imports] [--allow file] [--ls-tree prefix:sha]...",
    );
    return 0;
  }
  let paths;
  try {
    paths = listTrackedPaths({ cwd, recurseSubmodules: opts.recurseSubmodules });
    for (const tree of opts.trees) paths.push(...listTreePaths(tree.sha, tree.prefix, cwd));
  } catch (error) {
    log.error(String(error.message ?? error));
    return 2;
  }
  const unique = [...new Set(paths)];
  let allow = new Set();
  if (opts.allowFile) {
    try {
      allow = parseAllowlist(
        NodeFS.readFileSync(
          opts.allowFile.startsWith("/") ? opts.allowFile : `${cwd}/${opts.allowFile}`,
          "utf8",
        ),
      );
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
  log.log(
    `OK: ${unique.length} tracked path(s), no case-insensitive collisions${opts.imports ? ", including relative import specifiers" : ""}.`,
  );
  return 0;
}

export function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  return main(argv, {
    ...options,
    cwd,
    log: options.log ?? console,
    read: options.read ?? ((path) => NodeFS.readFileSync(`${cwd}/${path}`, "utf8")),
  });
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href)
  process.exitCode = run(process.argv.slice(2));
