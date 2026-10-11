/**
 * Broker-side wiring for `t3team.change_request.publish`: resolves the publisher OPTIONALLY from
 * the broker's environment (broker test layers without git still build; the tool then reports
 * "not enabled") and binds each call to the calling thread's checkout — its worktree when it has
 * one, else the project root, the same rule the worktree MCP tools use.
 *
 * @module t3team-toolBrokerChangeRequestLive
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { T3TeamChangeRequestPublisher } from "./t3team-changeRequestPublisher.ts";
import { describeChangeRequestPublishError } from "./t3team-changeRequestPublishErrors.ts";
import { threadCheckoutRoot } from "./t3team-threadCheckoutRoot.ts";
import type { T3TeamChangeRequestToolHandlers } from "./t3team-toolBrokerBindingChangeRequest.ts";
import type { T3TeamThreadReads } from "./t3team-toolBrokerThreadReads.ts";

export const makeChangeRequestToolsForThread = Effect.fn("makeChangeRequestToolsForThread")(
  function* (loadThreadProject: T3TeamThreadReads["loadThreadProject"]) {
    const publisher = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamChangeRequestPublisher),
    );
    if (publisher === undefined) return undefined;
    return (threadId: ThreadId): T3TeamChangeRequestToolHandlers => ({
      publish: (args) =>
        loadThreadProject(threadId).pipe(
          Effect.flatMap(({ thread, project }) =>
            publisher
              .publish({
                ...args,
                cwd: threadCheckoutRoot(thread, project.workspaceRoot),
                projectId: project.id,
              })
              .pipe(Effect.mapError(describeChangeRequestPublishError)),
          ),
        ),
    });
  },
);
