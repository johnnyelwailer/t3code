import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import {
  PLACEMENT_AREAS,
  RESTRICTED_PATHSPECS,
  isRestrictedArea,
  totalsByArea,
} from "./t3team-placement-areas.mjs";
import {
  BASELINE_FILE,
  collectFootprint,
  parseBaseline,
  serializeBaseline,
} from "./t3team-placement-footprint.mjs";
import { loadSeamRegistry, seamFor } from "./t3team-placement-registry.mjs";
import { allViolations, evaluatePlacement, hasBlockingGrowth } from "./t3team-placement-ratchet.mjs";
import { buildTeachingBlock } from "./t3team-placement-teach.mjs";

/** git runner that keeps stderr quiet: probing refs/files that may not exist is normal here. */
export function gitQuiet(args) {
  return NodeChildProcess.execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export const tryGit = (git, args) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};

/** Old->new rename pairs of the working tree vs `ref` (renames are only detected for tracked files). */
export function parseRenames(text) {
  const renames = new Map();
  for (const line of text.split("\n")) {
    const [code, from, to] = line.split("\t");
    if (code?.startsWith("R") && from && to) renames.set(to, from);
  }
  return renames;
}

/** True when HEAD brings in upstream commits origin/main does not have yet (an upstream sync). */
export function detectUpstreamSync(git) {
  const mine = tryGit(git, ["rev-list", "HEAD", "^origin/main"]);
  const theirs = tryGit(git, ["rev-list", "upstream/main", "^origin/main"]);
  if (!mine || !theirs) return false;
  const upstreamOnly = new Set(theirs.split("\n").filter(Boolean));
  return mine.split("\n").some((sha) => upstreamOnly.has(sha));
}

function readLocalBaseline(cwd) {
  const file = NodePath.join(cwd, BASELINE_FILE);
  if (!NodeFS.existsSync(file)) return { entries: new Map(), errors: [], exists: false };
  return { ...parseBaseline(NodeFS.readFileSync(file, "utf8")), exists: true };
}

/** Loads everything the ratchet needs from git; null when upstream/main is not fetched. */
export function loadPlacementContext({ cwd, git }) {
  const mergeBase = tryGit(git, ["merge-base", "HEAD", "upstream/main"]);
  if (!mergeBase) return null;
  const mainBase = tryGit(git, ["merge-base", "HEAD", "origin/main"]);
  const baseText = mainBase ? tryGit(git, ["show", `${mainBase}:${BASELINE_FILE}`]) : null;
  const registry = loadSeamRegistry(cwd);
  const items = collectFootprint({
    cwd,
    git,
    mergeBase,
    extraIgnoreGlobs: registry.ignoreGlobs,
    pathspecs: RESTRICTED_PATHSPECS,
  });
  const local = readLocalBaseline(cwd);
  return {
    mergeBase,
    mainBase,
    registry,
    items,
    local,
    baseBaseline: baseText === null ? null : parseBaseline(baseText).entries,
    renames: parseRenames(mainBase ? (tryGit(git, ["diff", "--name-status", "-M", mainBase]) ?? "") : ""),
    isSync: detectUpstreamSync(git),
  };
}

function evaluateContext(ctx) {
  return evaluatePlacement({
    items: ctx.items,
    baseline: ctx.local.entries,
    baselineErrors: ctx.local.errors,
    baseBaseline: ctx.baseBaseline,
    registry: ctx.registry,
    renames: ctx.renames,
    isSync: ctx.isSync,
  });
}

/** Warning level for every non-restricted area: what THIS change adds, measured against origin/main. */
function growthOutsideRestricted({ cwd, git, ctx }) {
  if (ctx.isSync || !ctx.mainBase) return [];
  const delta = collectFootprint({
    cwd,
    git,
    mergeBase: ctx.mainBase,
    extraIgnoreGlobs: ctx.registry.ignoreGlobs,
  });
  const outside = [...delta.values()].filter(
    (item) => !isRestrictedArea(item.area) && !seamFor(ctx.registry, item.path),
  );
  const totals = totalsByArea(outside);
  return PLACEMENT_AREAS.filter((area) => !isRestrictedArea(area))
    .filter((area) => totals[area].files + totals[area].modified > 0)
    .map(
      (area) =>
        `Placement (warning): this change adds ${totals[area].files} Nexi file(s) / ${totals[area].loc} lines and edits ${totals[area].modified} upstream file(s) (+${totals[area].addedLines} lines) in ${area}. Could any of it live in nx-nexi?`,
    );
}

/** Check mode: returns { violations, warnings, notes } to merge into the additive guard's report. */
export function runPlacementCheck({ cwd, git }) {
  const ctx = loadPlacementContext({ cwd, git });
  if (!ctx) {
    return {
      violations: [],
      warnings: [],
      notes: ["Placement ratchet skipped: upstream/main is not fetched (git fetch upstream main)."],
    };
  }
  const result = evaluateContext(ctx);
  const violations = allViolations(result);
  if (violations.length > 0) violations.push(`\n${buildTeachingBlock()}`);
  const warnings = [...result.warnings, ...growthOutsideRestricted({ cwd, git, ctx })];
  const notes = ctx.local.exists ? [] : [`${BASELINE_FILE} is missing: generate it with --write-placement-baseline --init.`];
  return { violations, warnings, notes };
}

/** `--write-placement-baseline [--init]`. Returns { ok, message }. Only ever lowers the baseline. */
export function writePlacementBaseline({ cwd, git, init = false }) {
  const ctx = loadPlacementContext({ cwd, git });
  if (!ctx) return { ok: false, message: "upstream/main is not fetched: run git fetch upstream main first." };
  const result = evaluateContext(ctx);
  const canInit = init && ctx.baseBaseline === null;
  if (hasBlockingGrowth(result) && !canInit) {
    return {
      ok: false,
      message: `${[...result.registryErrors, ...result.increases, ...result.budget].join("\n")}\n\nRefusing to write: the baseline only shrinks.\n${buildTeachingBlock()}`,
    };
  }
  NodeFS.writeFileSync(NodePath.join(cwd, BASELINE_FILE), serializeBaseline(result.tracked.values()));
  return { ok: true, message: `Wrote ${BASELINE_FILE}: ${result.tracked.size} restricted-area entries.` };
}
