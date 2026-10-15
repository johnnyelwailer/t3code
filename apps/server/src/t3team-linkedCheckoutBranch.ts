/**
 * Keeps a linked reference checkout on the branch the project chose for it, instead of whatever the
 * remote's default branch was when it was cloned. Never destroys work: the only things it deletes
 * or reverts are T3's own scaffold files (`AGENTS.md`, `CLAUDE.md`, the `.nexi/` and `.t3team/`
 * state, and its entries in `.gitignore`), and only when git says they block the switch. Anything
 * else that blocks it is reported and left alone.
 *
 * @module t3team-linkedCheckoutBranch
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { INSPECT_TIMEOUT_MS, linkedCheckoutGit as git } from "./t3team-linkedCheckoutGit.ts";
import {
  GITIGNORE_ENTRY,
  MAIN_REPOSITORY_GITIGNORE_ENTRIES,
} from "./t3team-project-repository-utils.ts";

const SWITCH_TIMEOUT_MS = 5 * 60_000;

/** Every line T3 writes into a workspace `.gitignore`. */
const T3_GITIGNORE_LINES: ReadonlySet<string> = new Set([
  GITIGNORE_ENTRY,
  ...MAIN_REPOSITORY_GITIGNORE_ENTRIES,
]);

const isScaffoldPath = (relativePath: string): boolean =>
  relativePath === "AGENTS.md" ||
  relativePath === "CLAUDE.md" ||
  relativePath.startsWith(".nexi/") ||
  relativePath.startsWith(".t3team/");

/** The paths git lists under "untracked working tree files would be overwritten by checkout". */
const untrackedBlockers = (stderr: string): ReadonlyArray<string> => {
  const lines = stderr.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /untracked working tree files would be overwritten/i.test(line),
  );
  if (start === -1) return [];
  const blockers: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("\t")) break;
    blockers.push(line.trim());
  }
  return blockers;
};

const firstMessageLine = (stderr: string): string =>
  stderr
    .split(/\r?\n/)
    .map((line) => line.replace(/^(error|fatal):\s*/i, "").trim())
    .find((line) => line.length > 0) ?? "git failed";

/** Reverts `.gitignore` when T3's own entries are all that was added to it. */
const revertScaffoldOnlyGitignore = Effect.fn("revertScaffoldOnlyGitignore")(function* (
  directory: string,
) {
  const diff = yield* git(
    "gitignoreDiff",
    directory,
    ["diff", "-U0", "--", ".gitignore"],
    INSPECT_TIMEOUT_MS,
  );
  if (diff.exitCode !== 0 || diff.stdout.trim().length === 0) return false;
  const changed = diff.stdout
    .split(/\r?\n/)
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  const ours = new Set<string>(MAIN_REPOSITORY_GITIGNORE_ENTRIES);
  const onlyOurAdditions = changed.every(
    (line) => line.startsWith("+") && ours.has(line.slice(1).trim()),
  );
  if (!onlyOurAdditions) return false;
  const reverted = yield* git(
    "gitignoreRevert",
    directory,
    ["checkout", "--", ".gitignore"],
    INSPECT_TIMEOUT_MS,
  );
  return reverted.exitCode === 0;
});

/** One remedy for what blocked a switch, when the blocker is T3's own scaffold; false otherwise. */
const clearScaffoldBlocker = Effect.fn("clearScaffoldBlocker")(function* (
  directory: string,
  stderr: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const blockers = untrackedBlockers(stderr);
  const scaffold = yield* Effect.forEach(blockers, (relative) =>
    isScaffoldPath(relative)
      ? Effect.succeed(true)
      : relative === ".gitignore"
        ? fileSystem.readFileString(path.join(directory, relative)).pipe(
            Effect.map((contents) =>
              contents
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .every((line) => T3_GITIGNORE_LINES.has(line)),
            ),
            Effect.orElseSucceed(() => false),
          )
        : Effect.succeed(false),
  );
  if (blockers.length > 0 && scaffold.every(Boolean)) {
    for (const relative of blockers) {
      yield* fileSystem.remove(path.join(directory, relative), { force: true }).pipe(Effect.ignore);
    }
    return true;
  }
  if (/local changes to the following files would be overwritten/i.test(stderr)) {
    return yield* revertScaffoldOnlyGitignore(directory);
  }
  return false;
});

/** At most one attempt per kind of scaffold blocker (untracked files, then `.gitignore`). */
const MAX_SWITCH_ATTEMPTS = 3;

const switchBranch = Effect.fn("switchLinkedCheckoutBranch")(function* (
  directory: string,
  branch: string,
) {
  let stderr = "";
  for (let attempt = 1; attempt <= MAX_SWITCH_ATTEMPTS; attempt += 1) {
    const result = yield* git("switch", directory, ["switch", branch], SWITCH_TIMEOUT_MS);
    if (result.exitCode === 0) return undefined;
    stderr = result.stderr;
    if (!(yield* clearScaffoldBlocker(directory, stderr))) break;
  }
  return `Could not switch to "${branch}": ${firstMessageLine(stderr)}`;
});

/**
 * Moves the checkout onto `branch` (creating the tracking branch when needed) and fast-forwards it
 * to the remote. Returns a message when it could not, or `undefined` once the checkout is on the
 * branch and current; the checkout stays usable either way.
 */
export const alignLinkedCheckoutBranch = Effect.fn("alignLinkedCheckoutBranch")(function* (
  directory: string,
  branch: string,
) {
  const remote = yield* git(
    "remoteBranch",
    directory,
    ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
    INSPECT_TIMEOUT_MS,
  );
  if (remote.exitCode !== 0) return `Branch "${branch}" does not exist on the remote.`;
  const current = yield* git(
    "currentBranch",
    directory,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    INSPECT_TIMEOUT_MS,
  );
  if (current.stdout.trim() !== branch) {
    const switched = yield* switchBranch(directory, branch);
    if (switched !== undefined) return switched;
  }
  const forwarded = yield* git(
    "fastForward",
    directory,
    ["merge", "--ff-only", `origin/${branch}`],
    SWITCH_TIMEOUT_MS,
  );
  return forwarded.exitCode === 0
    ? undefined
    : `"${branch}" could not be fast-forwarded: ${firstMessageLine(forwarded.stderr)}`;
});
