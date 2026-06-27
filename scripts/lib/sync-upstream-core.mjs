import * as NodeChildProcess from "node:child_process";
import {
  UPSTREAM_BASE_REF,
  UPSTREAM_REMOTE_NAME,
  UPSTREAM_REPO_SLUG,
  expectedUpstreamRemoteHint,
  isExpectedUpstreamRemoteUrl,
} from "./t3work-upstream-source-of-truth.mjs";

function runGit(args, options = {}) {
  const { allowFail = false, stdio = "pipe" } = options;
  try {
    const execOptions = { encoding: "utf8" };
    if (stdio === "inherit") execOptions.stdio = "inherit";
    const output = NodeChildProcess.execFileSync("git", args, execOptions);
    if (output === null) return "";
    return output.trim();
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

function ensureGitRepo() {
  if (!runGit(["rev-parse", "--show-toplevel"], { allowFail: true })) {
    throw new Error("Not inside a git repository.");
  }
}

function hasRemote(name) {
  return Boolean(runGit(["remote", "get-url", name], { allowFail: true }));
}

function assertCanonicalUpstreamRemote() {
  const remoteUrl = runGit(["remote", "get-url", UPSTREAM_REMOTE_NAME], { allowFail: true });
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

function getUpstreamRef() {
  const expectedSymbolic = `refs/remotes/${UPSTREAM_BASE_REF}`;
  const symbolic = runGit(["symbolic-ref", `refs/remotes/${UPSTREAM_REMOTE_NAME}/HEAD`], {
    allowFail: true,
  });
  if (symbolic) {
    if (symbolic !== expectedSymbolic) {
      throw new Error(
        `Upstream default branch must be '${UPSTREAM_BASE_REF}' (found: ${symbolic.replace(/^refs\/remotes\//, "")}).`,
      );
    }
    return UPSTREAM_BASE_REF;
  }
  if (runGit(["show-ref", "--verify", expectedSymbolic], { allowFail: true })) {
    return UPSTREAM_BASE_REF;
  }
  throw new Error(
    `Could not resolve ${UPSTREAM_BASE_REF}. Ensure remote '${UPSTREAM_REMOTE_NAME}' exists and fetch it.`,
  );
}

function getCurrentBranch() {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function ensureCurrentContainsUpstream(upstreamRef) {
  const ok = runGit(["merge-base", "--is-ancestor", upstreamRef, "HEAD"], {
    allowFail: true,
  });
  if (ok === null) {
    throw new Error(
      `Current branch does not contain ${upstreamRef}. Merge or rebase onto ${upstreamRef} before committing.`,
    );
  }
}

function requireCleanWorktree() {
  if (runGit(["status", "--porcelain"]).length > 0) {
    throw new Error(
      "Worktree is not clean. Commit/stash your changes before running sync commands.",
    );
  }
}

function getAheadBehind(leftRef, rightRef) {
  const counts = runGit(["rev-list", "--left-right", "--count", `${leftRef}...${rightRef}`]);
  const [left, right] = counts.split(/\s+/).map((v) => Number.parseInt(v, 10));
  return {
    leftOnly: Number.isFinite(left) ? left : 0,
    rightOnly: Number.isFinite(right) ? right : 0,
  };
}

function printStatus(upstreamRef, currentBranch) {
  const currentVsUpstream = getAheadBehind(upstreamRef, currentBranch);
  console.log(`upstream default: ${upstreamRef}`);
  console.log(`current branch:   ${currentBranch}`);
  console.log(
    `current vs upstream: behind=${currentVsUpstream.leftOnly} ahead=${currentVsUpstream.rightOnly}`,
  );

  const branchName = upstreamRef.split("/")[1] ?? "main";
  const localMainRef = runGit(["show-ref", "--verify", `refs/heads/${branchName}`], {
    allowFail: true,
  })
    ? branchName
    : null;
  if (localMainRef) {
    const localMainVsUpstream = getAheadBehind(upstreamRef, localMainRef);
    console.log(
      `${localMainRef} vs upstream: behind=${localMainVsUpstream.leftOnly} ahead=${localMainVsUpstream.rightOnly}`,
    );
  } else {
    console.log(`local '${branchName}' branch not found`);
  }

  if (!hasRemote("origin")) return;
  const originMainRef = `origin/${branchName}`;
  const hasOriginMain = runGit(["show-ref", "--verify", `refs/remotes/${originMainRef}`], {
    allowFail: true,
  });
  if (!hasOriginMain) {
    console.log(`remote branch '${originMainRef}' not found`);
    return;
  }
  const originMainVsUpstream = getAheadBehind(upstreamRef, originMainRef);
  console.log(
    `${originMainRef} vs upstream: behind=${originMainVsUpstream.leftOnly} ahead=${originMainVsUpstream.rightOnly}`,
  );
}

function ensureLocalMainBranch(upstreamRef) {
  const branchName = upstreamRef.split("/")[1] ?? "main";
  const exists = runGit(["show-ref", "--verify", `refs/heads/${branchName}`], { allowFail: true });
  if (exists) return branchName;
  runGit(["switch", "-c", branchName, "--track", upstreamRef], { stdio: "inherit" });
  return branchName;
}

function syncMain(upstreamRef, pushOrigin) {
  requireCleanWorktree();
  const startingBranch = getCurrentBranch();
  const mainBranch = ensureLocalMainBranch(upstreamRef);
  if (getCurrentBranch() !== mainBranch) runGit(["switch", mainBranch], { stdio: "inherit" });
  runGit(["rebase", upstreamRef], { stdio: "inherit" });
  if (pushOrigin) {
    if (!hasRemote("origin")) throw new Error("Cannot push: remote 'origin' not found.");
    runGit(["push", "--force-with-lease", "origin", mainBranch], { stdio: "inherit" });
  }
  if (startingBranch !== mainBranch) runGit(["switch", startingBranch], { stdio: "inherit" });
}

function rebaseCurrent(upstreamRef) {
  requireCleanWorktree();
  runGit(["rebase", upstreamRef], { stdio: "inherit" });
}

export function runSyncUpstreamCommand(argv) {
  ensureGitRepo();
  assertCanonicalUpstreamRemote();
  if (!hasRemote(UPSTREAM_REMOTE_NAME)) {
    throw new Error(
      `Remote '${UPSTREAM_REMOTE_NAME}' is missing. Add it with: ${expectedUpstreamRemoteHint()}`,
    );
  }

  const command = argv[2] ?? "status";
  const pushOrigin = argv.includes("--push-origin");
  if (command !== "verify-current") {
    try {
      runGit(["fetch", "--prune", UPSTREAM_REMOTE_NAME], { stdio: "inherit" });
    } catch (error) {
      if (command !== "status") throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`warning: fetch upstream failed, using local refs (${message})`);
    }
  }

  const upstreamRef = getUpstreamRef();
  const currentBranch = getCurrentBranch();
  if (command === "status") return printStatus(upstreamRef, currentBranch);
  if (command === "sync-main") {
    syncMain(upstreamRef, pushOrigin);
    return printStatus(upstreamRef, getCurrentBranch());
  }
  if (command === "rebase-current") {
    rebaseCurrent(upstreamRef);
    return printStatus(upstreamRef, getCurrentBranch());
  }
  if (command === "verify-current") {
    ensureCurrentContainsUpstream(upstreamRef);
    console.log(`current branch contains ${upstreamRef}`);
    return;
  }

  console.log("Usage: node scripts/t3work-sync-upstream-fork.mjs <command> [flags]");
  console.log("");
  console.log("Commands:");
  console.log("  status            Fetch and print ahead/behind against upstream");
  console.log("  sync-main         Rebase local main onto upstream default branch");
  console.log("  rebase-current    Rebase current branch onto upstream default branch");
  console.log("  verify-current    Verify current branch contains upstream default branch");
  console.log("");
  console.log("Flags:");
  console.log("  --push-origin     With sync-main, force-with-lease push main to origin");
  process.exitCode = 1;
}
