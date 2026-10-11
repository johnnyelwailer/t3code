/**
 * One background sync of a linked reference checkout: decides between clone, repair, re-clone
 * and fetch from what is on disk, and reports the outcome to record in the manifest. Never
 * reports a checkout of another repository as this one (fail closed on `origin`).
 *
 * @module t3team-linkedRepositorySyncJob
 */
import * as Effect from "effect/Effect";

import { redactUrlCredentials } from "./sourceControl/SourceControlRepositoryService.ts";
import {
  cloneLinkedCheckoutAtomically,
  describeSyncError,
  fetchLinkedCheckout,
  inspectLinkedCheckout,
  readLinkedCheckoutOrigin,
  recloneLinkedCheckout,
  repairLinkedCheckout,
} from "./t3team-linkedRepositoryCheckout.ts";
import type { LinkedRepositorySyncPhase } from "./t3team-project-repository-utils.ts";
import { isSameRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

export const syncLinkedCheckout = (job: {
  readonly url: string;
  readonly localPath: string;
  /** Reports the phase the sync entered, for status reads while it runs. */
  readonly onPhase: (phase: LinkedRepositorySyncPhase) => void;
}) => {
  const { localPath } = job;
  return Effect.gen(function* () {
    const state = yield* inspectLinkedCheckout(localPath);
    if (state === "foreign") {
      return {
        status: "failed",
        error: "Reference path already exists but is not a git repository.",
      } as const;
    }
    if (state === "missing") {
      job.onPhase("cloning");
      yield* cloneLinkedCheckoutAtomically({ url: job.url, directory: localPath });
      return { status: "cloned" } as const;
    }
    // Fail closed: only a checkout whose `origin` is this repository is ours to report on (a
    // path derived from another repository's URL can share the slug). A broken checkout that
    // cannot report one is never repaired in place: it is kept aside and this repository cloned.
    const origin = yield* readLinkedCheckoutOrigin(localPath);
    if (origin === undefined ? state === "valid" : !isSameRepository(origin, job.url)) {
      return {
        status: "failed",
        error: origin
          ? `Reference path already holds a different repository (${redactUrlCredentials(origin)}).`
          : "Reference path holds a git repository without an origin remote.",
      } as const;
    }
    if (origin === undefined) {
      job.onPhase("cloning");
      yield* recloneLinkedCheckout({ url: job.url, directory: localPath });
      return { status: "cloned" } as const;
    }
    job.onPhase("updating");
    if (state === "broken") yield* repairLinkedCheckout({ url: job.url, directory: localPath });
    yield* fetchLinkedCheckout(localPath);
    return { status: "updated" } as const;
  }).pipe(
    Effect.catch((cause) =>
      // A failed refresh of a still-usable checkout keeps it usable; only the error is new.
      inspectLinkedCheckout(localPath).pipe(
        Effect.orElseSucceed(() => "broken" as const),
        Effect.map((state) => ({
          status: state === "valid" ? ("updated" as const) : ("failed" as const),
          error: describeSyncError(cause),
        })),
      ),
    ),
  );
};
