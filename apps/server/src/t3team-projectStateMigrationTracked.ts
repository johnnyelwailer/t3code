/**
 * Which state-dir files the target checkout of a main-repository switch commits: those are team
 * state and always win over the migrated copy; any other existing file in the target is
 * machine-local and may be a stale leftover of an earlier switch attempt (see
 * `planAndLinkStateMigration`).
 *
 * @module t3team-projectStateMigrationTracked
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { INSPECT_TIMEOUT_MS, linkedCheckoutGit } from "./t3team-linkedCheckoutGit.ts";
import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";

/** State-dir-relative paths git tracks under `<toRoot>/<state dir>`. A target that is not a git
 * checkout tracks nothing (empty set). `undefined` when git could not answer completely (failed,
 * timed out, output truncated): the caller then keeps every existing target file. */
export const readTrackedStateFiles = Effect.fn("readTrackedStateFiles")(function* (toRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const isCheckout = yield* fileSystem
    .exists(path.join(toRoot, ".git"))
    .pipe(Effect.orElseSucceed(() => true));
  if (!isCheckout) return new Set<string>() as ReadonlySet<string>;
  const listed = yield* linkedCheckoutGit(
    "stateTrackedFiles",
    toRoot,
    ["ls-files", "-z", "--", HIDDEN_T3TEAM_DIR],
    INSPECT_TIMEOUT_MS,
  );
  if (listed.exitCode !== 0 || listed.stdoutTruncated) return undefined;
  const prefix = `${HIDDEN_T3TEAM_DIR}/`;
  const tracked = new Set<string>();
  for (const file of listed.stdout.split("\0")) {
    if (file.startsWith(prefix)) tracked.add(file.slice(prefix.length));
  }
  return tracked as ReadonlySet<string>;
});
