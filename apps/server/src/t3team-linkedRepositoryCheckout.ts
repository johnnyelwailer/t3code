/**
 * Crash-safe checkout operations for one linked reference repository, run by the background
 * sync (`t3team-linkedRepositorySync`). A clone lands in a sibling temp directory and is renamed
 * into place only once git finished, so an interrupted clone never leaves a half-checked-out
 * tree at the reference path; a tree left behind by an older, non-atomic clone is detected and
 * repaired (or re-cloned) instead of being reported as ready.
 *
 * @module t3team-linkedRepositoryCheckout
 */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  redactUrlCredentials,
  SourceControlRepositoryService,
} from "./sourceControl/SourceControlRepositoryService.ts";
import { t3teamRandomHex } from "./t3team-random.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

/** Generous: a first clone of a large repository legitimately takes many minutes. */
export const LINKED_REPOSITORY_CLONE_TIMEOUT_MS = 30 * 60_000;
export const LINKED_REPOSITORY_FETCH_TIMEOUT_MS = 10 * 60_000;
const INSPECT_TIMEOUT_MS = 2 * 60_000;

/** `missing`: nothing (or an empty directory) at the path. `valid`: a usable checkout. `broken`:
 * a git repository whose HEAD, index, or tracked files are incomplete. `foreign`: a non-empty
 * directory that is not a git repository — never touched, it is not ours to delete. */
export type LinkedCheckoutState = "missing" | "valid" | "broken" | "foreign";

const cloneTempPrefix = (directoryName: string) => `.${directoryName}.clone-`;

export const describeSyncError = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    const record = cause as { readonly detail?: unknown; readonly message?: unknown };
    if (typeof record.detail === "string" && record.detail.length > 0) return record.detail;
    if (typeof record.message === "string" && record.message.length > 0) return record.message;
  }
  return "Failed to sync linked repository reference.";
};

/** A failed fetch, described for the repository's status line (credentials redacted). */
export class LinkedRepositoryFetchError extends Data.TaggedError("LinkedRepositoryFetchError")<{
  readonly message: string;
}> {}

const git = Effect.fn("linkedCheckoutGit")(function* (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
) {
  const vcs = yield* VcsProcess;
  return yield* vcs.run({
    operation: `t3team.referenceRepository.${operation}`,
    command: "git",
    args,
    cwd,
    allowNonZeroExit: true,
    timeoutMs,
    maxOutputBytes: 64 * 1024,
    // No tty: a credential prompt would hang until the timeout; make git fail instead.
    env: { GIT_TERMINAL_PROMPT: "0" },
  });
});

export const inspectLinkedCheckout = Effect.fn("inspectLinkedCheckout")(function* (
  directory: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = (target: string) =>
    fileSystem.exists(target).pipe(Effect.orElseSucceed(() => false));
  if (!(yield* exists(directory))) return "missing" satisfies LinkedCheckoutState;
  if (!(yield* exists(path.join(directory, ".git")))) {
    const entries = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed(() => ["?"]));
    return (entries.length === 0 ? "missing" : "foreign") satisfies LinkedCheckoutState;
  }
  const head = yield* git(
    "head",
    directory,
    ["rev-parse", "--verify", "--quiet", "HEAD"],
    INSPECT_TIMEOUT_MS,
  );
  if (head.exitCode !== 0) return "broken" satisfies LinkedCheckoutState;
  // A clone interrupted during checkout has its objects but no (or a partial) index/work tree.
  if (!(yield* exists(path.join(directory, ".git", "index")))) return "broken";
  const deleted = yield* git("deleted", directory, ["ls-files", "--deleted"], INSPECT_TIMEOUT_MS);
  if (deleted.exitCode !== 0 || deleted.stdout.trim().length > 0) return "broken";
  return "valid" satisfies LinkedCheckoutState;
});

/** Clones into a sibling temp directory, then renames it into place. Leftover temp directories
 * from an earlier interrupted attempt are removed first; this attempt's own is removed on any
 * failure or interruption. */
export const cloneLinkedCheckoutAtomically = Effect.fn("cloneLinkedCheckoutAtomically")(
  function* (input: { readonly url: string; readonly directory: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceControl = yield* SourceControlRepositoryService;
    const parent = path.dirname(input.directory);
    const prefix = cloneTempPrefix(path.basename(input.directory));
    yield* fileSystem.makeDirectory(parent, { recursive: true });
    const siblings = yield* fileSystem.readDirectory(parent).pipe(Effect.orElseSucceed(() => []));
    for (const stale of siblings.filter((name) => name.startsWith(prefix))) {
      yield* fileSystem.remove(path.join(parent, stale), { recursive: true }).pipe(Effect.ignore);
    }
    const tempDirectory = path.join(parent, `${prefix}${t3teamRandomHex(4)}`);
    yield* sourceControl
      .cloneRepository(
        { remoteUrl: input.url, destinationPath: tempDirectory, protocol: "auto" },
        { timeoutMs: LINKED_REPOSITORY_CLONE_TIMEOUT_MS },
      )
      .pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : fileSystem
                .remove(tempDirectory, { recursive: true, force: true })
                .pipe(Effect.ignore),
        ),
      );
    // `missing` may still be an empty directory; rename cannot replace a directory on every platform.
    yield* fileSystem.remove(input.directory, { recursive: true, force: true }).pipe(Effect.ignore);
    yield* fileSystem.rename(tempDirectory, input.directory);
  },
);

/** Restores a broken checkout without discarding anything in it: a missing index is rebuilt from
 * HEAD (`read-tree` leaves the work tree alone) and only MISSING tracked files are written back
 * (`checkout-index -q` skips every file that exists, edited or not). When that is not enough (no
 * resolvable HEAD), the checkout is moved aside — kept, never deleted — and cloned fresh. */
export const repairLinkedCheckout = Effect.fn("repairLinkedCheckout")(function* (input: {
  readonly url: string;
  readonly directory: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const head = yield* git(
    "head",
    input.directory,
    ["rev-parse", "--verify", "--quiet", "HEAD"],
    INSPECT_TIMEOUT_MS,
  );
  if (head.exitCode === 0) {
    const hasIndex = yield* fileSystem
      .exists(path.join(input.directory, ".git", "index"))
      .pipe(Effect.orElseSucceed(() => false));
    if (!hasIndex) {
      yield* git("readTree", input.directory, ["read-tree", "HEAD"], INSPECT_TIMEOUT_MS);
    }
    yield* git("restore", input.directory, ["checkout-index", "-a", "-q"], INSPECT_TIMEOUT_MS);
    if ((yield* inspectLinkedCheckout(input.directory)) === "valid") return;
  }
  yield* fileSystem.rename(input.directory, `${input.directory}.broken-${t3teamRandomHex(4)}`);
  yield* cloneLinkedCheckoutAtomically(input);
});

/** The checkout's `origin` remote URL, or `undefined` when it has none. Local; no network. */
export const readLinkedCheckoutOrigin = Effect.fn("readLinkedCheckoutOrigin")(function* (
  directory: string,
) {
  const result = yield* git(
    "origin",
    directory,
    ["remote", "get-url", "origin"],
    INSPECT_TIMEOUT_MS,
  );
  const url = result.stdout.trim();
  return result.exitCode === 0 && url.length > 0 ? url : undefined;
});

export const fetchLinkedCheckout = Effect.fn("fetchLinkedCheckout")(function* (directory: string) {
  const result = yield* git(
    "fetch",
    directory,
    ["fetch", "--all", "--prune"],
    LINKED_REPOSITORY_FETCH_TIMEOUT_MS,
  );
  if (result.exitCode !== 0) {
    const tail = result.stderr.trim().split(/\r?\n/).slice(-2).join(" ");
    return yield* new LinkedRepositoryFetchError({
      message: redactUrlCredentials(tail) || "git fetch failed.",
    });
  }
});
