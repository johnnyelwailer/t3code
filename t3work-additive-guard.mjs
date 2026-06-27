/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import {
  candidateUpstreamCounterpartPaths,
  classifyPrefixedLocResult,
  countNonEmptyLines,
  matchesAnyGlob,
  shouldCheckLoc,
} from "./t3work-additive-guard-lib.mjs";
import { maybeCheckWhitelistedAutoMerge } from "./t3work-additive-guard-merge.mjs";
import {
  assertBaseRef,
  assertCanonicalUpstreamRemote,
  collectCandidatePaths,
  listFilesInRef,
  runGit,
} from "./scripts/lib/additive-guard-core.mjs";
import {
  additiveGuardConfigCacheKey,
  additiveGuardCacheKey,
  fileFingerprint,
  loadAdditiveGuardCache,
  saveAdditiveGuardCache,
} from "./scripts/lib/additive-guard-cache.mjs";
import { loadAdditiveGuardConfig } from "./scripts/lib/additive-guard-config.mjs";

function resolveUpstreamCounterpartPath(baseFiles, filePath, requiredPrefixes) {
  for (const candidate of candidateUpstreamCounterpartPaths(filePath, requiredPrefixes)) {
    if (baseFiles.has(candidate)) return candidate;
  }
  return null;
}

function main() {
  const cwd = process.cwd();
  assertCanonicalUpstreamRemote();
  const config = loadAdditiveGuardConfig(cwd);
  const baseRef = assertBaseRef(config.baseRef);
  const baseCommit = runGit(["rev-parse", baseRef]);
  const mergeBase = runGit(["merge-base", "HEAD", baseRef]);
  const candidates = collectCandidatePaths(mergeBase);
  const baseFiles = listFilesInRef(baseRef);
  const { cachePath, entries } = loadAdditiveGuardCache(cwd);
  const nextCacheEntries = {};
  const configKey = additiveGuardConfigCacheKey(config);

  const violations = [];
  const warnings = [];

  for (const filePath of candidates) {
    const isExisting = baseFiles.has(filePath);
    const fingerprint = NodeFS.existsSync(filePath) ? fileFingerprint(filePath) : "missing";

    if (isExisting) {
      const allowedExact = config.allowedModifiedFiles.includes(filePath);
      const allowedByGlob = matchesAnyGlob(filePath, config.allowedModifiedFileGlobs);
      if (!allowedExact && !allowedByGlob) {
        violations.push(
          `Modified upstream file not in whitelist: ${filePath}. Add it to allowedModifiedFiles only if absolutely required.`,
        );
      } else {
        const cacheKey = additiveGuardCacheKey({
          kind: "auto-merge",
          baseCommit,
          mergeBase,
          filePath,
          fingerprint,
          configKey,
        });
        const cached = entries[cacheKey];
        const autoMergeViolation =
          cached && "message" in cached
            ? cached.message
            : maybeCheckWhitelistedAutoMerge({
                baseRef,
                mergeBase,
                filePath,
              });
        nextCacheEntries[cacheKey] = { message: autoMergeViolation ?? null };
        if (autoMergeViolation) {
          violations.push(autoMergeViolation);
        }
      }
      continue;
    }

    const baseName = NodePath.basename(filePath);
    const hasRequiredPrefix = config.requiredPrefixes.some((prefix) => baseName.startsWith(prefix));
    const allowedUnprefixed = matchesAnyGlob(filePath, config.allowedUnprefixedNewFiles);
    if (!hasRequiredPrefix && !allowedUnprefixed) {
      violations.push(
        `New file must use one of prefixes [${config.requiredPrefixes.join(", ")}]: ${filePath} (or add a specific allow pattern).`,
      );
    }

    if (shouldCheckLoc(filePath, config.requiredPrefixes)) {
      const cacheKey = additiveGuardCacheKey({
        kind: "loc",
        baseCommit,
        mergeBase,
        filePath,
        fingerprint,
        configKey,
      });
      const cached = entries[cacheKey];
      const loc = typeof cached?.loc === "number" ? cached.loc : countNonEmptyLines(filePath);
      const counterpartPath =
        typeof cached?.counterpartPath === "string" || cached?.counterpartPath === null
          ? cached.counterpartPath
          : resolveUpstreamCounterpartPath(baseFiles, filePath, config.requiredPrefixes);
      nextCacheEntries[cacheKey] = { loc, counterpartPath };
      const result = classifyPrefixedLocResult({
        filePath,
        loc,
        locWarnThreshold: config.locWarnThreshold,
        locFailThreshold: config.locFailThreshold,
        counterpartPath,
      });
      if (result?.kind === "violation") {
        violations.push(result.message);
      } else if (result?.kind === "warning") {
        warnings.push(result.message);
      }
    }
  }

  saveAdditiveGuardCache(cachePath, nextCacheEntries);

  if (violations.length > 0) {
    console.error("t3work additive guard failed\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }

    if (warnings.length > 0) {
      console.error("\nWarnings:");
      for (const warning of warnings) {
        console.error(`- ${warning}`);
      }
    }

    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("t3work additive guard warnings\n");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn("");
  }

  console.log(
    `t3work additive guard passed (${candidates.size} changed files checked against ${baseRef}).`,
  );
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main();
}
