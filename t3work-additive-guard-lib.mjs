/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";

const LOC_CHECK_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".cts",
  ".mts",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
]);

const NON_PRODUCTION_LOC_WARN_THRESHOLD = 300;
const NON_PRODUCTION_LOC_FAIL_THRESHOLD = 600;
const NON_PRODUCTION_LOC_PATTERNS = [
  /\.test\.[^.]+$/i,
  /\.browser\.[^.]+$/i,
  /\.stories\.[^.]+$/i,
  /fixtures\.[^.]+$/i,
];

export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesAnyGlob(filePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

export function hasAnyRequiredPrefix(baseName, requiredPrefixes) {
  return requiredPrefixes.some((prefix) => baseName.startsWith(prefix));
}

function removeRequiredPrefix(baseName, requiredPrefixes) {
  for (const prefix of requiredPrefixes) {
    if (baseName.startsWith(prefix)) {
      return baseName.slice(prefix.length);
    }
  }
  return null;
}

function addWithRenamedBaseName(candidates, candidatePath, nextBaseName) {
  const replaced = NodePath.join(NodePath.dirname(candidatePath), nextBaseName);
  candidates.add(replaced);
}

export function candidateUpstreamCounterpartPaths(filePath, requiredPrefixes) {
  const candidates = new Set();
  const baseName = NodePath.basename(filePath);
  const withoutPrefix = removeRequiredPrefix(baseName, requiredPrefixes);
  if (!withoutPrefix) return [];

  addWithRenamedBaseName(candidates, filePath, withoutPrefix);

  if (filePath.startsWith("apps/web/src/t3work/")) {
    const remapped = filePath.replace("apps/web/src/t3work/", "apps/web/src/");
    addWithRenamedBaseName(candidates, remapped, withoutPrefix);
  }

  if (filePath.startsWith("apps/web/src/t3work/")) {
    const remapped = filePath.replace("apps/web/src/t3work/", "apps/project-shell/src/");
    addWithRenamedBaseName(candidates, remapped, withoutPrefix);
  }

  if (filePath.includes("/t3work/")) {
    const remapped = filePath.replace("/t3work/", "/");
    addWithRenamedBaseName(candidates, remapped, withoutPrefix);
  }

  return [...candidates];
}

export function classifyPrefixedLocResult({
  filePath,
  loc,
  locWarnThreshold,
  locFailThreshold,
  counterpartPath,
}) {
  const baseName = NodePath.basename(filePath);
  const usesNonProductionThresholds = NON_PRODUCTION_LOC_PATTERNS.some((pattern) =>
    pattern.test(baseName),
  );
  const effectiveWarnThreshold = usesNonProductionThresholds
    ? NON_PRODUCTION_LOC_WARN_THRESHOLD
    : locWarnThreshold;
  const effectiveFailThreshold = usesNonProductionThresholds
    ? NON_PRODUCTION_LOC_FAIL_THRESHOLD
    : locFailThreshold;

  if (loc > effectiveFailThreshold) {
    if (counterpartPath) {
      return {
        kind: "warning",
        message:
          `Prefixed migrated file exceeds ${effectiveFailThreshold} LOC (warning only due to upstream counterpart): ` +
          `${filePath} (${loc} non-empty lines) -> ${counterpartPath}.`,
      };
    }
    return {
      kind: "violation",
      message: `Prefixed file exceeds ${effectiveFailThreshold} LOC: ${filePath} (${loc} non-empty lines).`,
    };
  }

  if (loc > effectiveWarnThreshold) {
    return {
      kind: "warning",
      message: `Prefixed file is above ${effectiveWarnThreshold} LOC warning threshold: ${filePath} (${loc} non-empty lines).`,
    };
  }

  return null;
}

export function toSet(lines) {
  return new Set(
    lines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

export function shouldCheckLoc(filePath, requiredPrefixes) {
  const baseName = NodePath.basename(filePath);
  if (!hasAnyRequiredPrefix(baseName, requiredPrefixes)) return false;
  if (!NodeFS.existsSync(filePath)) return false;
  const ext = NodePath.extname(filePath).toLowerCase();
  return LOC_CHECK_EXTENSIONS.has(ext);
}

export function countNonEmptyLines(filePath) {
  const text = NodeFS.readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}
