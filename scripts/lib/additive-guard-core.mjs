/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeChildProcess from "node:child_process";
import {
  UPSTREAM_BASE_REF,
  UPSTREAM_REMOTE_NAME,
  UPSTREAM_REPO_SLUG,
  expectedUpstreamRemoteHint,
  isExpectedUpstreamRemoteUrl,
} from "./t3work-upstream-source-of-truth.mjs";

export function runGit(args) {
  return NodeChildProcess.execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function maybeRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

export function assertBaseRef(baseRef) {
  for (const candidate of [baseRef, "origin/main", "main"]) {
    if (maybeRunGit(["rev-parse", "--verify", candidate])) return candidate;
  }
  throw new Error(
    `Could not resolve base ref '${baseRef}' or fallback refs 'origin/main'/'main'. Fetch remotes and try again.`,
  );
}

export function assertCanonicalUpstreamRemote() {
  const remoteUrl = maybeRunGit(["remote", "get-url", UPSTREAM_REMOTE_NAME]);
  if (!remoteUrl) {
    throw new Error(
      `Remote '${UPSTREAM_REMOTE_NAME}' is missing. Add it with: ${expectedUpstreamRemoteHint()}`,
    );
  }
  if (!isExpectedUpstreamRemoteUrl(remoteUrl)) {
    throw new Error(
      `Remote '${UPSTREAM_REMOTE_NAME}' must point to ${UPSTREAM_REPO_SLUG} (found: ${remoteUrl}).`,
    );
  }
}

export function enforceCanonicalBaseRef(configBaseRef) {
  if (configBaseRef && configBaseRef !== UPSTREAM_BASE_REF) {
    throw new Error(
      `Invalid .t3work-additive-guard.json baseRef '${configBaseRef}'. Expected '${UPSTREAM_BASE_REF}'.`,
    );
  }
  return UPSTREAM_BASE_REF;
}

export function fileExistsInRef(ref, filePath) {
  const listed = maybeRunGit(["ls-tree", "-r", "--name-only", ref, "--", filePath]);
  return listed?.split("\n").includes(filePath) ?? false;
}

export function listFilesInRef(ref) {
  const listed = maybeRunGit(["ls-tree", "-r", "--name-only", ref]);
  if (!listed) return new Set();
  return new Set(
    listed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function collectIgnoredPaths(filePaths) {
  if (filePaths.length === 0) return new Set();
  let result = "";
  try {
    result = execFileSync("git", ["check-ignore", "--stdin"], {
      encoding: "utf8",
      input: `${filePaths.join("\n")}\n`,
    });
  } catch {
    return new Set();
  }
  return new Set(
    result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

export function collectCandidatePaths(mergeBase) {
  const chunks = [
    maybeRunGit(["diff", "--name-only", "--diff-filter=ACMR", mergeBase, "--"]),
    maybeRunGit(["diff", "--name-only", "--diff-filter=ACMR", "--"]),
    maybeRunGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--"]),
    maybeRunGit(["ls-files", "--others", "--exclude-standard"]),
  ];

  const combined = new Set();
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const filePath of chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)) {
      combined.add(filePath);
    }
  }
  const ignored = collectIgnoredPaths([...combined]);
  return new Set([...combined].filter((filePath) => !ignored.has(filePath)));
}
