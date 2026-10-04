/**
 * Provenance-note dispatch for the fork route: renders and records the
 * "forked from A to B" system note between the kept head and tail of a
 * middle-truncated fork transcript.
 *
 * Extracted from the fork route so that module stays under the prefixed-file
 * LOC ceiling.
 *
 * @module t3team-thread-fork-note
 */
import { CommandId, MessageId, type ModelSelection, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProviderRegistryShape } from "./provider/Services/ProviderRegistry.ts";
import { forkModelTransition, forkProvenanceNote } from "./t3team-fork-provenance.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export const dispatchForkProvenanceNote = (options: {
  readonly dispatch: OrchestrationEngineShape["dispatch"];
  readonly childThreadId: ThreadId;
  readonly parentThreadId: string;
  readonly parentTitle: string;
  readonly omittedMessageCount: number;
  readonly parentSelection: ModelSelection | null | undefined;
  readonly childSelection: ModelSelection;
  readonly createdAt: string;
  readonly providerRegistry: ProviderRegistryShape;
}): Effect.Effect<void, OrchestrationDispatchError> =>
  Effect.gen(function* () {
    // "Forked from A to B": the child inherits the parent's selection unless
    // the parent had none, in which case the "from" side is unknowable and the
    // clause is omitted. A snapshot read failure degrades the note to raw
    // instance ids / model slugs — it never blocks the fork.
    const providerSnapshots = yield* options.providerRegistry.getProviders.pipe(
      Effect.orElseSucceed(() => []),
    );
    const modelTransition = forkModelTransition(
      options.parentSelection ?? undefined,
      options.childSelection,
      providerSnapshots,
    );
    yield* options.dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`server:t3team:thread-fork:note:${t3teamRandomUUID()}`),
      threadId: options.childThreadId,
      message: {
        messageId: MessageId.make(`fork:${options.childThreadId}:note:${t3teamRandomUUID()}`),
        role: "system",
        text: forkProvenanceNote({
          parentTitle: options.parentTitle,
          omittedMessageCount: options.omittedMessageCount,
          modelTransition,
        }),
        turnId: null,
        streaming: false,
        t3teamExt: {
          forkSource: {
            threadId: options.parentThreadId,
            threadTitle: options.parentTitle,
            omittedMessageCount: options.omittedMessageCount,
            ...(options.parentSelection == null
              ? {}
              : {
                  parentSelection: {
                    instanceId: options.parentSelection.instanceId,
                    model: options.parentSelection.model,
                  },
                }),
            childSelection: {
              instanceId: options.childSelection.instanceId,
              model: options.childSelection.model,
            },
          },
        },
      },
      createdAt: options.createdAt,
    });
  });
