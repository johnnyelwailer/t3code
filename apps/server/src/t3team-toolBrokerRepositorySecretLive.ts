/**
 * Broker-side wiring for `t3team.repository_secret.set`: optional publisher + thread checkout.
 *
 * @module t3team-toolBrokerRepositorySecretLive
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { T3TeamRepositorySecretPublisher } from "./t3team-repositorySecretPublisher.ts";
import { threadCheckoutRoot } from "./t3team-threadCheckoutRoot.ts";
import type { T3TeamRepositorySecretToolHandlers } from "./t3team-toolBrokerBindingRepositorySecret.ts";
import type { T3TeamThreadReads } from "./t3team-toolBrokerThreadReads.ts";

export const makeRepositorySecretToolsForThread = Effect.fn("makeRepositorySecretToolsForThread")(
  function* (loadThreadProject: T3TeamThreadReads["loadThreadProject"]) {
    const publisher = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamRepositorySecretPublisher),
    );
    if (publisher === undefined) return undefined;
    return (threadId: ThreadId): T3TeamRepositorySecretToolHandlers => ({
      set: (args) =>
        loadThreadProject(threadId).pipe(
          Effect.flatMap(({ thread, project }) =>
            publisher.set({
              ...args,
              cwd: threadCheckoutRoot(thread, project.workspaceRoot),
              projectId: project.id,
              threadId,
            }),
          ),
        ),
    });
  },
);
