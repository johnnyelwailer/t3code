import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { globToRegExp } from "./t3team-additive-guard-lib.mjs";

export const SEAM_REGISTRY_FILE = ".t3team-extension-seams.json";

export const SEAM_KINDS = [
  "ui-slot",
  "capability-layer",
  "registry",
  "config",
  "native-module-registration",
  "protocol-extensibility",
];

// A seam is small by definition: a bigger budget means Nexi behaviour is hiding inside it.
export const MAX_SEAM_LOC = 300;

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PLACEHOLDER_POINTERS = new Set(["", "none", "n/a", "na", "tbd", "todo", "-"]);
const MATCH_ALL_GLOBS = new Set(["*", "**", "**/*", "./**"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSeam(seam, index, seenIds, errors) {
  const label = `seam #${index + 1}${isNonEmptyString(seam?.id) ? ` (${seam.id})` : ""}`;
  const fail = (message) => errors.push(`${SEAM_REGISTRY_FILE}: ${label}: ${message}`);
  if (!seam || typeof seam !== "object") return fail("must be an object");
  if (!isNonEmptyString(seam.id) || !KEBAB.test(seam.id)) fail("id must be kebab-case");
  else if (seenIds.has(seam.id)) fail("duplicate id");
  else seenIds.add(seam.id);
  if (!SEAM_KINDS.includes(seam.kind)) fail(`kind must be one of ${SEAM_KINDS.join(" | ")}`);
  if (!Array.isArray(seam.files) || seam.files.length === 0 || !seam.files.every(isNonEmptyString)) {
    fail("files must be a non-empty array of paths/globs");
  } else if (seam.files.some((glob) => MATCH_ALL_GLOBS.has(glob.trim()))) {
    fail("files must not be a match-all glob");
  }
  if (!isNonEmptyString(seam.description) || seam.description.trim().length < 20) {
    fail("description must say what the seam lets the distribution swap (>= 20 chars)");
  }
  const pointer = typeof seam.nexiImplementation === "string" ? seam.nexiImplementation.trim() : "";
  if (PLACEHOLDER_POINTERS.has(pointer.toLowerCase()) || pointer.length < 8) {
    fail("nexiImplementation must point at the nx-nexi path that fills this seam");
  }
  if (!isNonEmptyString(seam.owner)) fail("owner is required");
  if (!Number.isInteger(seam.maxLoc) || seam.maxLoc < 1 || seam.maxLoc > MAX_SEAM_LOC) {
    fail(`maxLoc must be an integer in 1..${MAX_SEAM_LOC} (a seam is small)`);
  }
}

/** Pure: validates a parsed registry. Returns { seams, ignoreGlobs, errors } and never throws. */
export function validateSeamRegistry(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.seams)) {
    return { seams: [], ignoreGlobs: [], errors: [`${SEAM_REGISTRY_FILE}: expected { "seams": [...] }`] };
  }
  const seenIds = new Set();
  raw.seams.forEach((seam, index) => validateSeam(seam, index, seenIds, errors));
  const ignoreGlobs = Array.isArray(raw.ignoreGlobs) ? raw.ignoreGlobs.filter(isNonEmptyString) : [];
  const seams = raw.seams.filter((seam) => seam && typeof seam === "object");
  return { seams, ignoreGlobs, errors };
}

export function loadSeamRegistry(cwd) {
  const registryPath = NodePath.join(cwd, SEAM_REGISTRY_FILE);
  if (!NodeFS.existsSync(registryPath)) {
    return { seams: [], ignoreGlobs: [], errors: [] };
  }
  try {
    return validateSeamRegistry(JSON.parse(NodeFS.readFileSync(registryPath, "utf8")));
  } catch (cause) {
    return {
      seams: [],
      ignoreGlobs: [],
      errors: [`${SEAM_REGISTRY_FILE}: not valid JSON (${cause.message})`],
    };
  }
}

/** First seam whose `files` globs match the path, or null. */
export function seamFor(registry, filePath) {
  for (const seam of registry.seams) {
    if (!Array.isArray(seam.files)) continue;
    if (seam.files.some((glob) => globToRegExp(glob).test(filePath))) return seam;
  }
  return null;
}
