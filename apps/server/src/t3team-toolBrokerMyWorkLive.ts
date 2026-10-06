/**
 * The live `t3team.mywork.*` handlers: the digest loader and arrangement store the HTTP routes
 * use, run in a context resolved once when the broker is built. A runtime that lacks any of the
 * services the loader reads gets no My Work tools (they answer "not enabled") rather than a
 * broker that fails to build.
 */
import * as Effect from "effect/Effect";

import type { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { loadT3TeamMyWorkDigestGraph } from "./t3team-myworkDigest.ts";
import { makeMyWorkHandlers } from "./t3team-toolBrokerMyWorkHandlers.ts";
import { resolveDigestContext } from "./t3team-toolBrokerMyWorkContext.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const makeMyWorkToolHandlers = Effect.fn("t3team.myWorkTools.make")(function* (input: {
  readonly projects: ProjectStoreV2["Service"];
  readonly threads: ThreadManagementService["Service"];
}) {
  const context = yield* resolveDigestContext(input.threads);
  if (context === undefined) return undefined;
  return makeMyWorkHandlers({
    projects: input.projects,
    loadDigest: (digest) =>
      loadT3TeamMyWorkDigestGraph(digest).pipe(
        Effect.provideContext(context),
        Effect.mapError(message),
      ),
    runStore: (effect) => effect.pipe(Effect.provideContext(context), Effect.mapError(message)),
  });
});
