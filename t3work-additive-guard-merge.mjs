/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export function maybeRunGitRaw(args) {
  const result = NodeChildProcess.spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout;
}

export function didWorkingTreeDifferFromRef(ref, filePath) {
  const result = NodeChildProcess.spawnSync("git", ["diff", "--quiet", ref, "--", filePath], {
    encoding: "utf8",
  });
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(
    `Failed to check working tree diff for ${filePath} against ${ref}: ${result.stderr || "unknown error"}`,
  );
}

export function didRefsDiffer(baseRef, targetRef, filePath) {
  const result = NodeChildProcess.spawnSync(
    "git",
    ["diff", "--quiet", baseRef, targetRef, "--", filePath],
    {
      encoding: "utf8",
    },
  );
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(
    `Failed to check ref diff for ${filePath} between ${baseRef} and ${targetRef}: ${result.stderr || "unknown error"}`,
  );
}

function truncateLines(text, maxLines) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more lines omitted)`;
}

function buildSyncAdvisory({ filePath, baseRef, mergeBase }) {
  return (
    `Whitelisted file has upstream changes: ${filePath}\n` +
    `Both this branch and ${baseRef} changed the file since merge-base ${mergeBase}.\n` +
    `Sync upstream changes before continuing:\n` +
    `  1. Commit or stash your current changes.\n` +
    `  2. bun run sync:upstream:current\n` +
    `  3. Rerun: node t3work-additive-guard.mjs`
  );
}

function buildManualMergeViolation({ filePath, baseRef, mergeBase, diffText }) {
  const trimmedDiff = truncateLines(diffText, 120);
  return (
    `Whitelisted file has upstream conflict: ${filePath}\n` +
    `Both this branch and ${baseRef} changed the file since merge-base ${mergeBase}.\n` +
    `Auto 3-way merge failed — manual resolution required.\n` +
    `\n` +
    `Recommended workflow:\n` +
    `  1. Commit or stash your current changes.\n` +
    `  2. bun run sync:upstream:current\n` +
    `     (rebases onto ${baseRef} and surfaces the conflict as a standard git conflict)\n` +
    `  3. Resolve the conflict in ${filePath}, then: git add ${filePath} && git rebase --continue\n` +
    `  4. Rerun: node t3work-additive-guard.mjs\n` +
    `\n` +
    `Diff (working tree vs ${baseRef}):\n${trimmedDiff}`
  );
}

/**
 * Check whether a whitelisted upstream file has diverged from upstream.
 * Returns null when only one side changed (no sync needed).
 * Returns a sync advisory when both sides changed but auto-merge is clean.
 * Returns a conflict violation (with diff) when auto-merge fails.
 */
export function maybeCheckWhitelistedAutoMerge({ baseRef, mergeBase, filePath }) {
  const oursChanged = didWorkingTreeDifferFromRef(mergeBase, filePath);
  if (!oursChanged) return null;

  const upstreamChanged = didRefsDiffer(mergeBase, baseRef, filePath);
  if (!upstreamChanged) return null;

  const baseText = maybeRunGitRaw(["show", `${mergeBase}:${filePath}`]);
  const theirsText = maybeRunGitRaw(["show", `${baseRef}:${filePath}`]);
  if (baseText === null || theirsText === null) {
    return (
      `Whitelisted file has upstream conflict: ${filePath}\n` +
      `Could not read file content from git refs (${baseRef} or merge-base).\n` +
      `Run: bun run sync:upstream:current (commit first), resolve conflicts, then rerun guard.`
    );
  }

  if (!NodeFS.existsSync(filePath)) {
    return (
      `Whitelisted file has upstream conflict: ${filePath}\n` +
      `File is missing from working tree but upstream changed it.\n` +
      `Run: bun run sync:upstream:current (commit first), resolve conflicts, then rerun guard.`
    );
  }

  const oursText = NodeFS.readFileSync(filePath, "utf8");
  const tempRoot = mkdtempSync(NodePath.join(os.tmpdir(), "t3work-additive-merge-"));
  const oursPath = NodePath.join(tempRoot, "ours");
  const basePath = NodePath.join(tempRoot, "base");
  const theirsPath = NodePath.join(tempRoot, "theirs");

  NodeFS.writeFileSync(oursPath, oursText, "utf8");
  NodeFS.writeFileSync(basePath, baseText, "utf8");
  NodeFS.writeFileSync(theirsPath, theirsText, "utf8");

  try {
    const mergeResult = NodeChildProcess.spawnSync(
      "git",
      ["merge-file", "-p", oursPath, basePath, theirsPath],
      {
        encoding: "utf8",
      },
    );
    if (mergeResult.status === 0) return buildSyncAdvisory({ filePath, baseRef, mergeBase });

    const diffResult = NodeChildProcess.spawnSync(
      "git",
      ["diff", "--no-index", "--", oursPath, theirsPath],
      {
        encoding: "utf8",
      },
    );
    const diffText = diffResult.stdout || mergeResult.stdout || "(diff unavailable)";
    return buildManualMergeViolation({ filePath, baseRef, mergeBase, diffText });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
