/**
 * Puts the project's main repository (the workspace checkout itself) on a chosen branch.
 * Fetch + align only: never clone, reclone or repair the workspace the way a reference sync would.
 *
 * @module t3team-mainRepositoryBranch
 */
import * as Effect from "effect/Effect";

import { alignLinkedCheckoutBranch } from "./t3team-linkedCheckoutBranch.ts";
import { describeSyncError, fetchLinkedCheckout } from "./t3team-linkedRepositoryCheckout.ts";

/** Fetches remotes, then (when `branch` is set) checks the workspace out on it. */
export const updateMainRepositoryCheckout = Effect.fn("updateMainRepositoryCheckout")(function* (
  localPath: string,
  branch?: string,
) {
  const fetchError = yield* fetchLinkedCheckout(localPath).pipe(
    Effect.as(undefined as string | undefined),
    Effect.catch((cause) => Effect.succeed(describeSyncError(cause))),
  );
  if (fetchError !== undefined) return fetchError;
  if (!branch) return undefined;
  return yield* alignLinkedCheckoutBranch(localPath, branch).pipe(
    Effect.catch((cause) => Effect.succeed(describeSyncError(cause))),
  );
});
