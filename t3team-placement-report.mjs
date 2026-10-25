import { PLACEMENT_AREAS, isRestrictedArea, totalsByArea } from "./t3team-placement-areas.mjs";
import { collectFootprint } from "./t3team-placement-footprint.mjs";
import { tryGit } from "./t3team-placement-guard.mjs";
import { loadSeamRegistry } from "./t3team-placement-registry.mjs";

/** `--placement-report`: footprint per area plus seam usage. */
export function placementReport({ cwd, git }) {
  const mergeBase = tryGit(git, ["merge-base", "HEAD", "upstream/main"]);
  if (!mergeBase) return "upstream/main is not fetched: run git fetch upstream main first.";
  const registry = loadSeamRegistry(cwd);
  const items = collectFootprint({ cwd, git, mergeBase, extraIgnoreGlobs: registry.ignoreGlobs });
  const totals = totalsByArea(items.values());
  const pad = (text, width) => String(text).padStart(width);
  const rows = PLACEMENT_AREAS.map((area) => {
    const t = totals[area];
    const mark = isRestrictedArea(area) ? "restricted" : "warn-only";
    return `${area.padEnd(24)}${pad(t.files, 7)}${pad(t.loc, 8)}${pad(t.modified, 10)}${pad(t.addedLines, 10)}  ${mark}`;
  });
  return [
    `Nexi footprint vs upstream merge-base ${mergeBase.slice(0, 10)}`,
    `${"area".padEnd(24)}${pad("files", 7)}${pad("loc", 8)}${pad("modified", 10)}${pad("+lines", 10)}`,
    ...rows,
    `registered seams: ${registry.seams.length}`,
  ].join("\n");
}
