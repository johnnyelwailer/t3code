/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeChildProcess from "node:child_process";
import {
  UPSTREAM_BASE_REF,
  UPSTREAM_REMOTE_NAME,
  UPSTREAM_REMOTE_PUSH_DISABLED,
  UPSTREAM_REMOTE_URL,
  UPSTREAM_REPO_SLUG,
  expectedUpstreamRemoteHint,
  isExpectedUpstreamRemoteUrl,
} from "./t3team-upstream-source-of-truth.mjs";

// `git ls-tree -r upstream/main` already emits >1 MB in this repo, which exceeds Node's default
// 1 MB maxBuffer. execFileSync then THROWS, `maybeRunGit` swallows it, and `listFilesInRef`
// returns an empty Set — so every upstream file looks new and the guard reports hundreds of bogus
// "New file must use one of prefixes" violations while missing real ones. Fail loudly on real git
// errors instead of silently degrading into a useless gate.
const GIT_OUTPUT_MAX_BUFFER = 256 * 1024 * 1024;

export function runGit(args) {
  return NodeChildProcess.execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  }).trim();
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
    // Configure it instead of failing. The upstream URL is a constant that will
    // never change, so a missing remote is not a decision anyone needs to make
    // — it is just an unconfigured checkout (fresh clone, submodule, worktree),
    // and blocking a completion gate on `git remote add` with a URL we already
    // hardcode is pure friction.
    addCanonicalUpstreamRemote();
    return;
  }
  if (!isExpectedUpstreamRemoteUrl(remoteUrl)) {
    // A remote that exists but points somewhere else is NOT auto-repaired: that
    // is a deliberate local setup we should not silently rewrite.
    throw new Error(
      `Remote '${UPSTREAM_REMOTE_NAME}' must point to ${UPSTREAM_REPO_SLUG} (found: ${remoteUrl}). ` +
        `Fix it with: git remote set-url ${UPSTREAM_REMOTE_NAME} ${UPSTREAM_REMOTE_URL}`,
    );
  }
  disableUpstreamPushUrl();
}

/**
 * Adds the canonical upstream remote as **fetch-only**.
 *
 * Auto-adding a remote must not quietly create a way to violate AGENTS.md's
 * hard rule that we never push or open PRs against upstream, so the push URL is
 * pointed at a sentinel and `git push upstream` fails loudly. Fetching — all
 * the guard actually needs to resolve `upstream/main` — still works.
 */
function addCanonicalUpstreamRemote() {
  try {
    runGit(["remote", "add", UPSTREAM_REMOTE_NAME, UPSTREAM_REMOTE_URL]);
    disableUpstreamPushUrl();
    console.log(
      `[additive-guard] configured fetch-only remote '${UPSTREAM_REMOTE_NAME}' -> ${UPSTREAM_REMOTE_URL}`,
    );
  } catch (cause) {
    throw new Error(
      `Could not configure remote '${UPSTREAM_REMOTE_NAME}' automatically (${cause instanceof Error ? cause.message : String(cause)}). ` +
        `Add it manually with: ${expectedUpstreamRemoteHint()}`,
    );
  }
}

/** Idempotent: keeps upstream unpushable even if the remote predates this guard. */
function disableUpstreamPushUrl() {
  const pushUrl = maybeRunGit(["remote", "get-url", "--push", UPSTREAM_REMOTE_NAME]);
  if (pushUrl === UPSTREAM_REMOTE_PUSH_DISABLED) return;
  maybeRunGit([
    "remote",
    "set-url",
    "--push",
    UPSTREAM_REMOTE_NAME,
    UPSTREAM_REMOTE_PUSH_DISABLED,
  ]);
}

export function enforceCanonicalBaseRef(configBaseRef) {
  if (configBaseRef && configBaseRef !== UPSTREAM_BASE_REF) {
    throw new Error(
      `Invalid .t3team-additive-guard.json baseRef '${configBaseRef}'. Expected '${UPSTREAM_BASE_REF}'.`,
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
