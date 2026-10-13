/**
 * Reads what is on disk at a linked checkout's path and says whether it is usable. Git failing to
 * answer is not evidence the checkout is damaged: only a definite answer ("no such commit",
 * missing tracked files) counts as `broken`, because `broken` is what gets a checkout re-cloned.
 *
 * @module t3team-linkedCheckoutInspect
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { INSPECT_TIMEOUT_MS, linkedCheckoutGit as git } from "./t3team-linkedCheckoutGit.ts";

/** `missing`: nothing (or an empty directory) at the path. `valid`: a usable checkout. `broken`:
 * a git repository whose HEAD, index, or tracked files are definitely incomplete. `unreadable`:
 * git could not answer (dubious ownership, a lock, a crash) — never repaired or re-cloned, since
 * nothing says it is damaged. `foreign`: a non-empty directory that is not a git repository —
 * never touched, it is not ours to delete. */
export type LinkedCheckoutState = "missing" | "valid" | "broken" | "unreadable" | "foreign";

/** Git refusing or failing to look, as opposed to what it found: a checkout owned by another
 * user (`safe.directory`), an access error, or a concurrent git holding a lock. None of these says
 * the checkout is damaged, so none may lead to it being moved aside and cloned again. */
const GIT_COULD_NOT_LOOK =
  /dubious ownership|permission denied|unable to access|access is denied|index\.lock|cannot lock|another git process/i;

const couldNotLook = (result: { readonly stderr: string }) =>
  GIT_COULD_NOT_LOOK.test(result.stderr);

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
  if (head.exitCode !== 0) {
    return (couldNotLook(head) ? "unreadable" : "broken") satisfies LinkedCheckoutState;
  }
  // A clone interrupted during checkout has its objects but no (or a partial) index/work tree.
  if (!(yield* exists(path.join(directory, ".git", "index")))) return "broken";
  const deleted = yield* git("deleted", directory, ["ls-files", "--deleted"], INSPECT_TIMEOUT_MS);
  if (deleted.exitCode !== 0) return couldNotLook(deleted) ? "unreadable" : "broken";
  return deleted.stdout.trim().length > 0 ? "broken" : "valid";
});
