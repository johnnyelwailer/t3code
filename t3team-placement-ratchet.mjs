import { isRestrictedArea } from "./t3team-placement-areas.mjs";
import { MAX_TOTAL_SEAM_LOC, seamFor } from "./t3team-placement-registry.mjs";

// Pure ratchet evaluation. No git, no filesystem: everything arrives as arguments so each rule is
// unit-testable. The rules:
//   increase  a restricted-area item that is new, or bigger than its reference entry, and is not
//             inside a registered seam                                          -> violation
//   budget    a seam's files together exceed its maxLoc                         -> violation
//   lock-in   the committed baseline lists something the tree no longer has (or has less of)
//             -> violation: run --write-placement-baseline so the reduction cannot be undone
//   reference is the baseline at the merge-base with origin/main when readable, so a PR cannot
//             raise the committed baseline to match its own growth; else the committed baseline.
// An upstream sync relaxes only the INCREASE rule for `modified` entries (a sync moves upstream's
// lines under ours, so added-line counts shift): such growth is a warning, but the committed
// baseline must then be regenerated in the same PR, so main never carries a stale baseline.

const describeItem = (item) =>
  item.kind === "modified"
    ? `upstream file edited (+${item.loc} lines vs upstream)`
    : `${item.loc} non-empty lines`;

function referenceFor(item, reference, renames) {
  const direct = reference.get(item.path);
  if (direct) return direct;
  const old = renames.get(item.path);
  const moved = old ? reference.get(old) : undefined;
  return moved && moved.area === item.area ? moved : undefined;
}

export function evaluatePlacement({
  items,
  baseline,
  baselineErrors = [],
  baseBaseline = null,
  registry,
  renames = new Map(),
  isSync = false,
}) {
  const result = {
    registryErrors: [...registry.errors],
    baselineErrors: [...baselineErrors],
    increases: [],
    budget: [],
    lockIns: [],
    warnings: [],
    tracked: new Map(),
    seamUsage: new Map(),
  };
  const reference = baseBaseline ?? baseline;

  for (const item of items.values()) {
    const seam = seamFor(registry, item.path);
    if (seam) {
      result.seamUsage.set(seam.id, (result.seamUsage.get(seam.id) ?? 0) + item.loc);
    } else if (isRestrictedArea(item.area)) {
      result.tracked.set(item.path, item);
    }
  }

  for (const seam of registry.seams) {
    const used = result.seamUsage.get(seam.id) ?? 0;
    if (Number.isInteger(seam.maxLoc) && used > seam.maxLoc) {
      result.budget.push(
        `Seam '${seam.id}' uses ${used} lines but its budget is ${seam.maxLoc}. A seam stays small: move the Nexi behaviour into ${seam.nexiImplementation}, or raise maxLoc with a reason.`,
      );
    }
  }

  const totalSeamLoc = [...result.seamUsage.values()].reduce((sum, loc) => sum + loc, 0);
  if (totalSeamLoc > MAX_TOTAL_SEAM_LOC) {
    result.budget.push(
      `Registered seams total ${totalSeamLoc} lines, over the ${MAX_TOTAL_SEAM_LOC} cap for all seams together. Move behaviour into nx-nexi or remove seams that nx-nexi no longer fills.`,
    );
  }

  for (const item of result.tracked.values()) {
    const ref = referenceFor(item, reference, renames);
    const relax = isSync && item.kind === "modified";
    const sink = relax ? result.warnings : result.increases;
    const committed = baseline.get(item.path);
    if (relax && (!committed || item.loc > committed.loc)) {
      result.lockIns.push(
        `Baseline is out of date after the upstream sync: ${item.path} (${describeItem(item)}). Regenerate it: node t3team-additive-guard.mjs --write-placement-baseline`,
      );
    }
    if (!ref) {
      sink.push(
        `Nexi footprint grew in ${item.area}: ${item.path} (${describeItem(item)}) is not in the baseline and not inside a registered seam.`,
      );
    } else if (item.loc > ref.loc) {
      sink.push(
        `Nexi footprint grew in ${item.area}: ${item.path} went from ${ref.loc} to ${item.loc} (${describeItem(item)}), outside any registered seam.`,
      );
    }
  }

  for (const [path, entry] of baseline) {
    if (!isRestrictedArea(entry.area)) continue;
    const current = result.tracked.get(path);
    if (current && current.loc >= entry.loc) continue;
    const now = current ? `${current.loc} lines` : seamFor(registry, path) ? "covered by a seam" : "gone";
    result.lockIns.push(
      `Baseline is higher than reality: ${path} is listed at ${entry.loc} but is now ${now}. Lock the reduction in: node t3team-additive-guard.mjs --write-placement-baseline`,
    );
  }

  for (const [path, entry] of reference) {
    const seam = isRestrictedArea(entry.area) ? seamFor(registry, path) : null;
    if (seam) {
      result.warnings.push(
        `REVIEW: legacy footprint file ${path} is now covered by seam '${seam.id}'. Confirm it is a real seam (small, generic, additive), not Nexi code parked under a budget.`,
      );
    }
  }
  return result;
}

export function allViolations(result) {
  return [
    ...result.registryErrors,
    ...result.baselineErrors,
    ...result.increases,
    ...result.budget,
    ...result.lockIns,
  ];
}

/** True when a PR may not lower the baseline file because it ADDS footprint (write is refused). */
export function hasBlockingGrowth(result) {
  return result.registryErrors.length + result.increases.length + result.budget.length > 0;
}
