import { SEAM_KINDS, MAX_SEAM_LOC, SEAM_REGISTRY_FILE } from "./t3team-placement-registry.mjs";

// The failure message is the only documentation an agent is guaranteed to read at the moment it
// is about to put Nexi code in the wrong place, so it carries the whole rule.

export const PLACEMENT_PRINCIPLE = [
  "1. As much Nexi code as possible lives in nx-nexi (hive/nx-nexi, nexplore.ghe.com); as little as possible in this fork.",
  "2. apps/mobile: ONLY extension seams (slots, registries, capability layers) that let the distribution swap out small or big parts of the UI.",
  "3. packages/contracts + client-runtime: ONLY extensibility seams (tolerate unknown items, capability gating); no Nexi-specific protocol content.",
  "4. Dependency direction: nx-nexi -> fork, never fork -> nx-nexi. Nexi screens, sign-in, broker client, branding, native code live in nx-nexi.",
  "5. What is already here is legacy debt: the baseline may only shrink. Growth in a restricted area needs a registered seam.",
  `6. A seam is small (<= ${MAX_SEAM_LOC} LOC), generic, additive, upstreamable, and names the nx-nexi path that fills it.`,
];

export function buildTeachingBlock() {
  return [
    "PLACEMENT PRINCIPLE (PJ):",
    ...PLACEMENT_PRINCIPLE.map((line) => `  ${line}`),
    "",
    "WHAT TO DO:",
    "  a) Can the code live in nx-nexi (pack, portal, broker, shared package)? Put it there, not here.",
    "     Scaffold it from an nx-nexi checkout: node dev/scripts/new-nexi-extension.mjs <kind> <name>",
    "  b) If the fork genuinely needs a hook, make the SMALLEST generic seam and register it in",
    `     ${SEAM_REGISTRY_FILE}: { id, kind (${SEAM_KINDS.join(" | ")}),`,
    '     files: [globs], description, nexiImplementation: "<nx-nexi path that fills it>", owner, maxLoc }.',
    "     Print a ready-made entry + skeleton: node dev/scripts/new-nexi-extension.mjs seam --kind <kind> <name>",
    "  c) After REDUCING the footprint, lock it in: node t3team-additive-guard.mjs --write-placement-baseline",
    "  d) See the table: node t3team-additive-guard.mjs --placement-report",
    "  Guide: docs/shared/guides/placement.md in nx-nexi (decision tree, seam catalogue, review rubric).",
  ].join("\n");
}
