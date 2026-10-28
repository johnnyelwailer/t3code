import { matchesAnyGlob } from "./t3team-additive-guard-lib.mjs";

// Placement areas: where in the fork a Nexi addition lands. RESTRICTED areas are the ones PJ's
// placement principle protects (mobile app: extension seams only; protocol: extensibility seams
// only): growth there fails the guard unless a registered seam covers it. Every other area only
// warns. See t3team-placement-teach.mjs for the principle text.

export const MOBILE_OTHER_AREA = "apps/mobile/other";
export const OTHER_AREA = "other";

export const PLACEMENT_AREAS = [
  "apps/mobile/src",
  "apps/mobile/modules",
  MOBILE_OTHER_AREA,
  "apps/web/src",
  "apps/desktop/src",
  "apps/server/src",
  "packages/contracts",
  "packages/client-runtime",
  "packages/shared",
  OTHER_AREA,
];

export const RESTRICTED_AREAS = new Set([
  "apps/mobile/src",
  "apps/mobile/modules",
  MOBILE_OTHER_AREA,
  "packages/contracts",
  "packages/client-runtime",
]);

// Pathspecs handed to git so the restricted-area diff stays small and fast.
export const RESTRICTED_PATHSPECS = ["apps/mobile", "packages/contracts", "packages/client-runtime"];

// Files nobody hand-writes: counting them would punish regeneration, not placement.
export const DEFAULT_IGNORE_GLOBS = [
  "**/__snapshots__/**",
  "**/*.snap",
  "**/*.generated.*",
  "**/*.gen.ts",
  "**/routeTree.gen.ts",
  "apps/mobile/generated-*",
  "apps/mobile/uniwind-types.d.ts",
  "pnpm-lock.yaml",
  ".t3team-placement-baseline.jsonl",
  ".t3team-extension-seams.json",
];

export function areaOf(filePath) {
  for (const prefix of ["apps/mobile/src", "apps/mobile/modules"]) {
    if (filePath.startsWith(`${prefix}/`)) return prefix;
  }
  if (filePath.startsWith("apps/mobile/")) return MOBILE_OTHER_AREA;
  for (const prefix of PLACEMENT_AREAS) {
    if (prefix === MOBILE_OTHER_AREA || prefix === OTHER_AREA) continue;
    if (filePath.startsWith(`${prefix}/`)) return prefix;
  }
  return OTHER_AREA;
}

export function isRestrictedArea(area) {
  return RESTRICTED_AREAS.has(area);
}

export function isIgnoredPath(filePath, extraGlobs = []) {
  return matchesAnyGlob(filePath, [...DEFAULT_IGNORE_GLOBS, ...extraGlobs]);
}

export function emptyTotals() {
  return Object.fromEntries(
    PLACEMENT_AREAS.map((area) => [area, { files: 0, loc: 0, modified: 0, addedLines: 0 }]),
  );
}

/** Sums footprint items into per-area totals (files/loc for added files, modified/addedLines for edits). */
export function totalsByArea(items) {
  const totals = emptyTotals();
  for (const item of items) {
    const bucket = totals[item.area];
    if (item.kind === "modified") {
      bucket.modified += 1;
      bucket.addedLines += item.loc;
    } else {
      bucket.files += 1;
      bucket.loc += item.loc;
    }
  }
  return totals;
}
