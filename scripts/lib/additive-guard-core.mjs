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
      { cause: cause },
    );
  }
}

/** Idempotent: keeps upstream unpushable even if the remote predates this guard. */
function disableUpstreamPushUrl() {
  const pushUrl = maybeRunGit(["remote", "get-url", "--push", UPSTREAM_REMOTE_NAME]);
  if (pushUrl === UPSTREAM_REMOTE_PUSH_DISABLED) return;
  maybeRunGit(["remote", "set-url", "--push", UPSTREAM_REMOTE_NAME, UPSTREAM_REMOTE_PUSH_DISABLED]);
}

export function enforceCanonicalBaseRef(configBaseRef) {
  if (configBaseRef && configBaseRef !== UPSTREAM_BASE_REF) {
    throw new Error(
      `Invalid .t3team-additive-guard.json baseRef '${configBaseRef}'. Expected '${UPSTREAM_BASE_REF}'.`,
    );
  }
  return UPSTREAM_BASE_REF;
}

/**
 * Environment variable that forces the guard onto the canonical upstream base, bypassing any
 * configured fork baseline. It is reserved for the informational upstream-drift step in
 * `.github/workflows/t3team-additive-guard.yml`, which must keep measuring against live
 * upstream even while the blocking base is the frozen fork baseline. Only `upstream/main` is
 * accepted, so the variable can never repoint the blocking gate at a weaker ref.
 */
export const ADDITIVE_GUARD_BASE_ENV = "T3TEAM_ADDITIVE_GUARD_BASE";

/** Fork-baseline tags live in this namespace; the guard refuses any other base ref. */
const FORK_BASELINE_REF_PATTERN = /^t3team\/fork-baseline-[0-9][0-9A-Za-z.-]*$/;

export function enforceForkBaselineRef(configForkBaselineRef) {
  if (!configForkBaselineRef) return undefined;
  if (
    typeof configForkBaselineRef !== "string" ||
    !FORK_BASELINE_REF_PATTERN.test(configForkBaselineRef)
  ) {
    throw new Error(
      `Invalid .t3team-additive-guard.json forkBaselineRef '${configForkBaselineRef}'. ` +
        `It must be a frozen fork-baseline tag of the form 't3team/fork-baseline-<date>' ` +
        `(created at a fork main commit, e.g. git tag -a t3team/fork-baseline-YYYYMMDD <commit>).`,
    );
  }
  return configForkBaselineRef;
}

/**
 * Resolves the guard's BLOCKING base ref.
 *
 * `baseRef` stays `upstream/main` — that is what the guard measures against when no fork
 * baseline is configured (upstream checkouts, pre-fork history). Once this fork became a full
 * product fork, measuring against upstream — pinned to any sync point or live — fails on the
 * fork's own debt (~2.8k files differ from upstream; 1,373 violations on main alone). The
 * blocking base is therefore a frozen fork-baseline tag: the fork tree at that tag is the
 * grandfathered debt, and every new unwhitelisted upstream-file edit, new unprefixed file, or
 * LOC growth on top of it still fails the guard exactly as before.
 *
 * The tag is namespaced to `t3team/fork-baseline-*` and shape-checked by
 * `enforceForkBaselineRef` so the config cannot quietly repoint the guard at an arbitrary ref.
 * A configured tag that does not resolve in this checkout fails loudly instead of falling back
 * to `upstream/main` — on this fork that fallback would compare main against itself, or
 * against live upstream, and either pass vacuously or fail on grandfathered debt.
 */
export function resolveBlockingBaseRef(config) {
  const override = process.env[ADDITIVE_GUARD_BASE_ENV];
  if (override !== undefined) {
    if (override !== UPSTREAM_BASE_REF) {
      throw new Error(
        `Invalid ${ADDITIVE_GUARD_BASE_ENV}='${override}'. Only '${UPSTREAM_BASE_REF}' is accepted; ` +
          `it forces the canonical upstream base for informational drift measurement.`,
      );
    }
    return assertBaseRef(override);
  }

  if (config.forkBaselineRef) {
    const resolved = maybeRunGit([
      "rev-parse",
      "--verify",
      "--quiet",
      `${config.forkBaselineRef}^{commit}`,
    ]);
    if (!resolved) {
      throw new Error(
        `forkBaselineRef '${config.forkBaselineRef}' does not resolve to a commit in this checkout. ` +
          `Fetch it first: git fetch origin "${config.forkBaselineRef}^{commit}"` +
          ` (the tag must exist on origin; if it has not been pushed yet: git push origin "${config.forkBaselineRef}"). ` +
          `The guard refuses to fall back to ${UPSTREAM_BASE_REF} — on this fork that would fail on grandfathered debt.`,
      );
    }
    return config.forkBaselineRef;
  }

  return assertBaseRef(config.baseRef);
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
