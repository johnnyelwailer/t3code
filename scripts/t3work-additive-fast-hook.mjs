#!/usr/bin/env node
/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import {
  countNonEmptyLines,
  matchesAnyGlob,
  shouldCheckLoc,
} from "../t3work-additive-guard-lib.mjs";

const DEFAULT_LOC_WARN_THRESHOLD = 150;
const DEFAULT_LOC_FAIL_THRESHOLD = 200;
const CACHE_FILE = NodePath.join(".git", "hooks", "t3work-additive-fast-hook-cache.json");
const MAX_NEW_FILES_TO_SCAN = 80;

function maybeRunGit(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function splitLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function loadConfig(cwd) {
  const configPath = NodePath.join(cwd, ".t3work-additive-guard.json");
  if (!NodeFS.existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(NodeFS.readFileSync(configPath, "utf8"));
    return {
      requiredPrefixes: parsed.requiredPrefixes ?? [parsed.requiredPrefix ?? "t3work-"],
      locWarnThreshold: parsed.locWarnThreshold ?? DEFAULT_LOC_WARN_THRESHOLD,
      locFailThreshold: parsed.locFailThreshold ?? DEFAULT_LOC_FAIL_THRESHOLD,
      allowedUnprefixedNewFiles: parsed.allowedUnprefixedNewFiles ?? [],
    };
  } catch {
    return null;
  }
}

function collectNewFiles() {
  const untracked = splitLines(maybeRunGit(["ls-files", "--others", "--exclude-standard"]));
  const stagedAdded = splitLines(
    maybeRunGit(["diff", "--cached", "--name-only", "--diff-filter=A", "--"]),
  );
  const unstagedAdded = splitLines(maybeRunGit(["diff", "--name-only", "--diff-filter=A", "--"]));

  return [...new Set([...untracked, ...stagedAdded, ...unstagedAdded])]
    .filter((filePath) => NodeFS.existsSync(filePath))
    .slice(0, MAX_NEW_FILES_TO_SCAN);
}

function loadCache(cwd) {
  const cachePath = NodePath.join(cwd, CACHE_FILE);
  if (!NodeFS.existsSync(cachePath)) {
    return { cachePath, byPath: {} };
  }

  try {
    const parsed = JSON.parse(NodeFS.readFileSync(cachePath, "utf8"));
    return { cachePath, byPath: parsed.byPath ?? {} };
  } catch {
    return { cachePath, byPath: {} };
  }
}

function saveCache(cachePath, byPath) {
  const parentDir = NodePath.dirname(cachePath);
  if (!NodeFS.existsSync(parentDir)) {
    NodeFS.mkdirSync(parentDir, { recursive: true });
  }

  NodeFS.writeFileSync(cachePath, `${JSON.stringify({ byPath }, null, 2)}\n`, "utf8");
}

function getFingerprint(filePath) {
  const stats = NodeFS.statSync(filePath);
  return `${stats.size}:${Math.floor(stats.mtimeMs)}`;
}

function toHookEventPayload(rawInput) {
  if (!rawInput || rawInput.trim().length === 0) return null;
  try {
    return JSON.parse(rawInput);
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    return NodeFS.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function extractEventName(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.hookEventName ?? payload.eventName ?? payload.event ?? null;
}

function buildSystemMessage({ violations, warnings, scanned }) {
  const lines = [
    `t3work fast additive hook checked ${scanned} new file${scanned === 1 ? "" : "s"}.`,
  ];

  if (violations.length > 0) {
    lines.push("Violations:");
    for (const violation of violations) {
      lines.push(`- ${violation}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const cwd = process.cwd();
  const hookPayload = toHookEventPayload(readStdin());
  const eventName = extractEventName(hookPayload);

  // This hook is configured for PostToolUse only; silently no-op for other events.
  if (eventName && eventName !== "PostToolUse") {
    process.exit(0);
  }

  const config = loadConfig(cwd);
  if (!config) {
    process.exit(0);
  }

  const candidates = collectNewFiles();
  if (candidates.length === 0) {
    process.exit(0);
  }

  const { cachePath, byPath } = loadCache(cwd);
  const nextCache = {};
  const changedCandidates = [];

  const violations = [];
  const warnings = [];

  for (const filePath of candidates) {
    const fingerprint = getFingerprint(filePath);
    const cached = byPath[filePath];

    const loc =
      cached && cached.fingerprint === fingerprint && typeof cached.loc === "number"
        ? cached.loc
        : countNonEmptyLines(filePath);

    nextCache[filePath] = { fingerprint, loc };

    if (!cached || cached.fingerprint !== fingerprint) {
      changedCandidates.push(filePath);
    }
  }

  if (changedCandidates.length === 0) {
    saveCache(cachePath, nextCache);
    process.exit(0);
  }

  for (const filePath of changedCandidates) {
    const baseName = NodePath.basename(filePath);
    const hasRequiredPrefix = config.requiredPrefixes.some((prefix) => baseName.startsWith(prefix));
    const allowedUnprefixed = matchesAnyGlob(filePath, config.allowedUnprefixedNewFiles);

    if (!hasRequiredPrefix && !allowedUnprefixed) {
      violations.push(
        `New file should use one of [${config.requiredPrefixes.join(", ")}]: ${filePath} (or add a specific allow pattern).`,
      );
    }

    if (!shouldCheckLoc(filePath, config.requiredPrefixes)) {
      continue;
    }

    const loc = nextCache[filePath]?.loc;
    if (typeof loc !== "number") {
      continue;
    }

    if (loc > config.locFailThreshold) {
      violations.push(
        `Prefixed file exceeds ${config.locFailThreshold} LOC: ${filePath} (${loc} non-empty lines).`,
      );
      continue;
    }

    if (loc > config.locWarnThreshold) {
      warnings.push(
        `Prefixed file is above ${config.locWarnThreshold} LOC warning threshold: ${filePath} (${loc} non-empty lines).`,
      );
    }
  }

  saveCache(cachePath, nextCache);

  if (violations.length === 0 && warnings.length === 0) {
    process.exit(0);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        continue: true,
        systemMessage: buildSystemMessage({
          violations,
          warnings,
          scanned: changedCandidates.length,
        }),
      },
      null,
      2,
    )}\n`,
  );
}

main();
