#!/usr/bin/env node
/**
 * Re-render gate for UI PRs.
 *
 * Every PR-touched `.tsx` component under `apps/web/src` that holds state,
 * subscribes to a store, or renders a list must ship a sibling
 * `<Name>.rerender.test.tsx` that uses the shared `renderCounter` helper —
 * the test is the render budget. Alternatively the PR body carries an
 * explicit exemption line:
 *
 *   Rerender: n/a, <reason naming what cannot re-render wrongly>
 *
 * One-word reasons are rejected. The rule, the heuristic table, and the
 * helper live in `docs/internals/t3team-rerender-gate.md`.
 *
 * Usage:
 *   node t3team-rerender-gate.mjs --files <changed-files.txt> [--body <pr-body.txt>]
 *
 * `<changed-files.txt>` holds one changed path per line (e.g. from
 * `git diff --name-only`). `<pr-body.txt>` is optional.
 */
import * as NodeFS from "node:fs";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

export const RERENDER_HELPER_TOKEN = "renderCounter";

// A PR-touched `.tsx` file is gated when it is a component under
// `apps/web/src` (tests, stories, and the shared design system are out of
// scope) and shows at least one interactivity signal below.
export const WEB_COMPONENT_ROOT = "apps/web/src/";
export const DESIGN_SYSTEM_DIR = "apps/web/src/components/ui/";
export const NON_COMPONENT_FILE = /\.(test|spec|stories|story)\.[^.]+$/;

export const STATE_SIGNAL = /\buse(State|Reducer)\s*\(/;
export const STORE_SIGNAL =
  /\buse(Atom|AtomValue|Store|StoreShallow|Shallow|SyncExternalStore)\s*\(/;
export const LIST_SIGNAL = /\{\s*[\w$]+(?:\.[\w$]+)*\.map\(/;

export const EXEMPTION_LINE = /^\s*[-*]?\s*Rerender:\s*n\/a\s*,\s*(.+?)\s*$/m;

export function rerenderTestPath(componentFile) {
  return `${componentFile.slice(0, -".tsx".length)}.rerender.test.tsx`;
}

export function interactiveComponentReasons(file, content) {
  if (!file.startsWith(WEB_COMPONENT_ROOT) || !file.endsWith(".tsx")) return [];
  if (file.startsWith(DESIGN_SYSTEM_DIR) || NON_COMPONENT_FILE.test(file)) return [];
  const reasons = [];
  if (STATE_SIGNAL.test(content)) reasons.push("state");
  if (STORE_SIGNAL.test(content)) reasons.push("store");
  if (LIST_SIGNAL.test(content)) reasons.push("list");
  return reasons;
}

export function readExemption(prBody) {
  const match = EXEMPTION_LINE.exec(prBody ?? "");
  if (!match) return { present: false, valid: false, reason: null };
  const reason = match[1];
  return { present: true, valid: reason.split(/\s+/).length >= 2, reason };
}

/**
 * `readFile` resolves a path to its content, or `null` when absent. Tests
 * pass a fixture map; the CLI passes the on-disk tree.
 */
export function evaluateRerenderGate({ changedFiles, prBody, readFile }) {
  const flagged = [];
  for (const file of changedFiles) {
    const content = readFile(file) ?? "";
    const reasons = interactiveComponentReasons(file, content);
    if (reasons.length > 0) flagged.push({ file, reasons });
  }

  const satisfied = [];
  const missing = [];
  for (const { file, reasons } of flagged) {
    const testFile = rerenderTestPath(file);
    const testContent = readFile(testFile);
    if (testContent !== null && testContent.includes(RERENDER_HELPER_TOKEN)) {
      satisfied.push(file);
    } else {
      missing.push({ file, reasons, testFile });
    }
  }

  const exemption = readExemption(prBody);
  const failing = exemption.valid ? [] : missing;
  return { flagged, satisfied, missing, exemption, pass: failing.length === 0, failing };
}

export function renderGateReport(result) {
  const lines = [];
  if (result.flagged.length > 0) {
    lines.push(`Gated components (${result.flagged.length}):`);
    for (const { file, reasons } of result.flagged) {
      lines.push(`  - ${file} (${reasons.join(", ")})`);
    }
  }
  if (result.pass) {
    lines.push("rerender gate: PASS");
    return lines;
  }
  lines.push("rerender gate: FAIL");
  for (const { file, testFile, reasons } of result.failing) {
    lines.push(
      `- ${file} (${reasons.join(", ")}) has no ${testFile} using ${RERENDER_HELPER_TOKEN}`,
    );
  }
  lines.push(
    "Add the test with the shared helper (~/test/t3team-renderCounter), or add to the PR body:",
  );
  lines.push("Rerender: n/a, <reason naming what cannot re-render wrongly>");
  return lines;
}

export function main(argv) {
  let filesArg = null;
  let bodyArg = null;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--files") {
      filesArg = argv[i + 1];
      i += 1;
    }
    if (argv[i] === "--body") {
      bodyArg = argv[i + 1];
      i += 1;
    }
  }
  if (filesArg === null) {
    console.error(
      "usage: node t3team-rerender-gate.mjs --files <changed-files.txt> [--body <pr-body.txt>]",
    );
    process.exit(2);
  }
  const changedFiles = NodeFS.readFileSync(filesArg, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const prBody = bodyArg === null ? "" : NodeFS.readFileSync(bodyArg, "utf8");
  const result = evaluateRerenderGate({
    changedFiles,
    prBody,
    readFile: (path) => {
      try {
        return NodeFS.readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
  });
  for (const line of renderGateReport(result)) {
    console.log(line);
  }
  process.exit(result.pass ? 0 : 1);
}

if (NodeProcess.argv[1] && import.meta.url === NodeURL.pathToFileURL(NodeProcess.argv[1]).href) {
  main(NodeProcess.argv);
}
