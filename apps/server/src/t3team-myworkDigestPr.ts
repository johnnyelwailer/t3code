/**
 * The digest's change-request read: the pull request listing straight off the
 * shared TTL cache (zero host calls while the cache is warm). A host that
 * cannot be read this round degrades — the section stays empty and says so in
 * `note` — rather than failing the whole digest.
 */

import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { PullRequestListEntry } from "@t3tools/contracts";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";

export const DIGEST_PR_LIMIT = 50;

export type PrReadResult = {
  readonly entries: readonly PullRequestListEntry[];
  readonly note?: string;
};

export function loadPrEntries(
  appProjectId: string | undefined,
): Effect.Effect<PrReadResult | undefined, never, PullRequestService> {
  return Effect.gen(function* () {
    if (appProjectId === undefined) return undefined;
    const service = yield* PullRequestService;
    return yield* service
      .list({ state: "all", projectId: ProjectId.make(appProjectId), limit: DIGEST_PR_LIMIT })
      .pipe(
        Effect.map((list) => ({ entries: list.entries })),
        Effect.catch((error) =>
          Effect.succeed({
            entries: [] as readonly PullRequestListEntry[],
            note: error instanceof Error ? error.message : "Change requests could not be read.",
          }),
        ),
      );
  });
}
