/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const CACHE_FILE_NAME = "t3work-additive-guard-cache.json";

function resolveAdditiveGuardCachePath(cwd) {
  const result = NodeChildProcess.spawnSync(
    "git",
    ["rev-parse", "--git-path", NodePath.join("hooks", CACHE_FILE_NAME)],
    { cwd, encoding: "utf8" },
  );
  if (result.status === 0) {
    return result.stdout.trim();
  }

  return NodePath.join(cwd, ".git", "hooks", CACHE_FILE_NAME);
}

export function loadAdditiveGuardCache(cwd) {
  const cachePath = resolveAdditiveGuardCachePath(cwd);
  if (!NodeFS.existsSync(cachePath)) {
    return { cachePath, entries: {} };
  }

  try {
    const parsed = JSON.parse(NodeFS.readFileSync(cachePath, "utf8"));
    return { cachePath, entries: parsed.entries ?? {} };
  } catch {
    return { cachePath, entries: {} };
  }
}

export function saveAdditiveGuardCache(cachePath, entries) {
  const parentDir = NodePath.dirname(cachePath);
  if (!NodeFS.existsSync(parentDir)) {
    NodeFS.mkdirSync(parentDir, { recursive: true });
  }

  NodeFS.writeFileSync(cachePath, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
}

export function fileFingerprint(filePath) {
  const stats = NodeFS.statSync(filePath);
  return `${stats.size}:${Math.floor(stats.mtimeMs)}`;
}

export function additiveGuardCacheKey({
  kind,
  baseCommit,
  mergeBase,
  filePath,
  fingerprint,
  configKey,
}) {
  return [kind, baseCommit, mergeBase, filePath, fingerprint, configKey].join("\0");
}

export function additiveGuardConfigCacheKey(config) {
  return JSON.stringify({
    requiredPrefixes: config.requiredPrefixes,
    locWarnThreshold: config.locWarnThreshold,
    locFailThreshold: config.locFailThreshold,
    allowedModifiedFiles: config.allowedModifiedFiles,
    allowedModifiedFileGlobs: config.allowedModifiedFileGlobs,
    allowedUnprefixedNewFiles: config.allowedUnprefixedNewFiles,
  });
}
