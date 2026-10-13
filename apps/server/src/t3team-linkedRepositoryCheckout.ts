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
import { renameDirectoryWithRetry } from "./t3team-renameWithRetry.ts";
import { isSameRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import {
  INSPECT_TIMEOUT_MS,
  LINKED_REPOSITORY_CLONE_TIMEOUT_MS,
  LINKED_REPOSITORY_FETCH_TIMEOUT_MS,
  linkedCheckoutGit as git,
} from "./t3team-linkedCheckoutGit.ts";
import { inspectLinkedCheckout } from "./t3team-linkedCheckoutInspect.ts";

const cloneTempPrefix = (directoryName: string) => `.${directoryName}.clone-`;

export const describeSyncError = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    const record = cause as { readonly detail?: unknown; readonly message?: unknown };
    if (typeof record.detail === "string" && record.detail.length > 0) return record.detail;
    if (typeof record.message === "string" && record.message.length > 0) return record.message;
  }
  return "Failed to sync linked repository reference.";
};

/** A failed clone publication or fetch, described for the repository's status line (credentials redacted). */
class LinkedRepositorySyncError extends Data.TaggedError("LinkedRepositorySyncError")<{
  readonly message: string;
}> {}

/** A clone an earlier attempt finished but could not publish is complete and healthy: renaming it
 * into place beats downloading the repository again. A partial one is not, and is left for the
 * caller to remove. Returns whether one was adopted. */
const adoptFinishedClone = Effect.fn("adoptFinishedClone")(function* (input: {
  readonly url: string;
  readonly directory: string;
  readonly leftovers: ReadonlyArray<string>;
}) {
  for (const candidate of input.leftovers) {
    const state = yield* inspectLinkedCheckout(candidate).pipe(
      Effect.orElseSucceed(() => "broken" as const),
    );
    if (state !== "valid") continue;
    const origin = yield* readLinkedCheckoutOrigin(candidate).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    if (origin === undefined || !isSameRepository(origin, input.url)) continue;
    yield* renameDirectoryWithRetry(candidate, input.directory);
    return true;
  }
  return false;
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
    // `missing` may be an empty directory: drop it now (non-recursive, so a non-empty one fails
    // instead of being deleted). Publishing is a bare rename that never replaces anything.
    if (yield* fileSystem.exists(input.directory)) yield* fileSystem.remove(input.directory);
    const siblings = yield* fileSystem.readDirectory(parent).pipe(Effect.orElseSucceed(() => []));
    const leftovers = siblings
      .filter((name) => name.startsWith(prefix))
      .map((name) => path.join(parent, name));
    if (yield* adoptFinishedClone({ url: input.url, directory: input.directory, leftovers })) {
      return;
    }
    for (const stale of leftovers) {
      yield* fileSystem.remove(stale, { recursive: true }).pipe(Effect.ignore);
    }
    const tempDirectory = path.join(parent, `${prefix}${t3teamRandomHex(4)}`);
    const discardTemp = fileSystem
      .remove(tempDirectory, { recursive: true, force: true })
      .pipe(Effect.ignore);
    yield* sourceControl
      .cloneRepository(
        { remoteUrl: input.url, destinationPath: tempDirectory, protocol: "auto" },
        { timeoutMs: LINKED_REPOSITORY_CLONE_TIMEOUT_MS },
      )
      .pipe(Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : discardTemp)));
    if (yield* fileSystem.exists(input.directory)) {
      yield* discardTemp;
      return yield* new LinkedRepositorySyncError({
        message: "The reference path was created by something else while cloning.",
      });
    }
    // A failure here keeps the finished clone: the next attempt adopts it instead of downloading
    // the whole repository again.
    yield* renameDirectoryWithRetry(tempDirectory, input.directory);
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
  yield* recloneLinkedCheckout(input);
});

/** Moves the checkout aside — kept, never deleted — and clones `url` fresh in its place. */
export const recloneLinkedCheckout = Effect.fn("recloneLinkedCheckout")(function* (input: {
  readonly url: string;
  readonly directory: string;
}) {
  yield* renameDirectoryWithRetry(
    input.directory,
    `${input.directory}.broken-${t3teamRandomHex(4)}`,
  );
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
    return yield* new LinkedRepositorySyncError({
      message: redactUrlCredentials(tail) || "git fetch failed.",
    });
  }
});

export { inspectLinkedCheckout, type LinkedCheckoutState } from "./t3team-linkedCheckoutInspect.ts";
