/**
 * The operations of a `remoteEnvironment` session runtime that involve no turn: the provider thread
 * is a bookkeeping record (the conversation lives on the cloud session), and steering, runtime
 * requests, rollback and fork are unsupported here with the reason spelled out.
 */
import {
  OrchestrationV2ProviderThread,
  type ProviderInstanceId,
  type ProviderSessionId,
} from "@t3tools/contracts";
import {
  ProviderAdapterEnsureThreadError,
  ProviderAdapterForkThreadError,
  ProviderAdapterRollbackThreadError,
  ProviderAdapterRuntimeRequestResponseError,
  ProviderAdapterSteerRunUnsupportedError,
  type ProviderAdapterV2SessionRuntime,
  type ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

const decodeProviderThread = Schema.decodeUnknownEffect(
  Schema.toCodecJson(OrchestrationV2ProviderThread),
);

export const remoteEnvironmentThreadOperations = (input: {
  readonly instanceId: ProviderInstanceId;
  readonly providerSessionId: ProviderSessionId;
  readonly nowIso: () => string;
}) => {
  const driver = REMOTE_ENVIRONMENT_DRIVER;
  const { nowIso } = input;
  const unsupportedThread = (providerThread: ProviderAdapterV2TurnInput["providerThread"]) => ({
    driver,
    providerThreadId: providerThread.id,
    cause: new Error(
      "A remote environment thread runs on the cloud session; it cannot be rewound or forked here.",
    ),
  });

  return {
    ensureThread: (value) =>
      decodeProviderThread({
        id: `provider-thread:${value.threadId}`,
        driver,
        providerInstanceId: input.instanceId,
        providerSessionId: input.providerSessionId,
        appThreadId: value.threadId,
        ownerNodeId: null,
        nativeThreadRef: { driver, nativeId: `remote:${value.threadId}`, strength: "strong" },
        nativeConversationHeadRef: null,
        status: "idle",
        firstRunOrdinal: null,
        lastRunOrdinal: null,
        handoffIds: [],
        forkedFrom: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderAdapterEnsureThreadError({ driver, threadId: value.threadId, cause }),
        ),
      ),
    resumeThread: (value) => Effect.succeed(value.providerThread),
    steerTurn: (value) =>
      Effect.fail(
        new ProviderAdapterSteerRunUnsupportedError({
          driver,
          providerThreadId: value.providerThread.id,
        }),
      ),
    respondToRuntimeRequest: (value) =>
      Effect.fail(
        new ProviderAdapterRuntimeRequestResponseError({
          driver,
          requestId: value.requestId,
          cause: new Error("A remote environment thread has no requests to answer here."),
        }),
      ),
    readThreadSnapshot: (value) =>
      Effect.succeed({
        providerThread: value.providerThread,
        providerTurns: [],
        messages: [],
        runtimeRequests: [],
      }),
    rollbackThread: (value) =>
      Effect.fail(new ProviderAdapterRollbackThreadError(unsupportedThread(value.providerThread))),
    forkThread: (value) =>
      Effect.fail(
        new ProviderAdapterForkThreadError(unsupportedThread(value.sourceProviderThread)),
      ),
  } satisfies Pick<
    ProviderAdapterV2SessionRuntime,
    | "ensureThread"
    | "resumeThread"
    | "steerTurn"
    | "respondToRuntimeRequest"
    | "readThreadSnapshot"
    | "rollbackThread"
    | "forkThread"
  >;
};
