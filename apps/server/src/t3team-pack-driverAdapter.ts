/**
 * Pack orchestration adapter bridge.
 *
 * Maps a pack's `PackOrchestrationAdapter` (`@t3team/pack-api`, Promise + JSON) onto the host
 * `ProviderAdapterV2` service one-to-one. `openSession` runs in the session scope the
 * `ProviderSessionManagerV2` owns: the scope's close calls the pack session's `close()` (bounded)
 * and ends its event stream; a session that resolves after the open was interrupted is closed
 * when it arrives. The session receives the thread's MCP access and a
 * `requestContinuation` host service that feeds `ProviderContinuationRequests`, the same queue
 * built-in adapters use for provider-native wakes.
 *
 * @module t3team-pack-driverAdapter
 */
import type {
  PackContinuationRequest,
  PackOpenSessionInput,
  PackOrchestrationAdapter,
  PackSessionRuntime,
} from "@t3team/pack-api";
import {
  ProviderThreadId,
  ThreadId,
  type ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  ProviderAdapterCapabilitiesError,
  ProviderAdapterOpenSessionError,
  ProviderAdapterProtocolError,
  type ProviderAdapterV2,
} from "@t3tools/provider-core/server/ProviderAdapter";
import type { ProviderContinuationRequest } from "@t3tools/provider-core/server/ProviderContinuationRequests";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import { packCall, packRoundTrip } from "./t3team-pack-driverCall.ts";
import { asPack, PackCodec } from "./t3team-pack-driverCodec.ts";
import { type PackMcpSessions, readPackMcpSession } from "./t3team-pack-driverMcp.ts";
import { PACK_MCP_APPS_HOST, type PackMcpAppSnapshot } from "./t3team-pack-driverMcpApps.ts";
import { makePackSessionRuntime } from "./t3team-pack-driverSession.ts";

/** Upper bound on a pack session `close()` so a hung teardown cannot stall session release. */
const CLOSE_TIMEOUT = Duration.seconds(5);

const decodeNotification = Schema.decodeUnknownOption(PackCodec.notification);

const toContinuationRequest = (
  driver: ProviderDriverKind,
  request: PackContinuationRequest,
): ProviderContinuationRequest => {
  const notification =
    request.notification === undefined ? Option.none() : decodeNotification(request.notification);
  return {
    threadId: ThreadId.make(request.threadId),
    providerThreadId: ProviderThreadId.make(request.providerThreadId),
    driver,
    detail: request.detail,
    ...(Option.isSome(notification) ? { notification: notification.value } : {}),
    ...(request.delivery === undefined ? {} : { delivery: request.delivery }),
  };
};

export const makePackOrchestrationAdapter = (input: {
  readonly adapter: PackOrchestrationAdapter;
  readonly driver: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  /** Host continuation queue (`ProviderContinuationRequests.offer`). */
  readonly offerContinuation: (request: ProviderContinuationRequest) => Effect.Effect<void>;
  /** Host MCP credential registry (`McpProviderSessions`), read per session and per turn. */
  readonly mcpSessions: PackMcpSessions;
  /** Absent: the host offers no MCP Apps to the pack. */
  readonly mcpAppSnapshot?: PackMcpAppSnapshot;
}): ProviderAdapterV2["Service"] => {
  const { adapter, driver, instanceId, mcpSessions, mcpAppSnapshot } = input;
  const plan = adapter.planSelectionTransition;
  return {
    instanceId,
    driver,
    getCapabilities: () => {
      const bridge = packCall((cause) => new ProviderAdapterCapabilitiesError({ driver, cause }));
      return bridge
        .call(() => adapter.getCapabilities())
        .pipe(Effect.flatMap((raw) => bridge.decode(PackCodec.capabilities, raw)));
    },
    planSelectionTransition: (value) =>
      plan === undefined
        ? Effect.succeed(turnScopedSelectionTransition())
        : packRoundTrip(
            packCall(
              (cause) =>
                new ProviderAdapterProtocolError({
                  driver,
                  detail: "planSelectionTransition failed",
                  cause,
                }),
            ),
            { codec: PackCodec.selectionTransitionInput, value },
            (encoded) => plan.call(adapter, asPack(encoded)),
            PackCodec.selectionTransitionPlan,
          ),
    openSession: (value) =>
      Effect.gen(function* () {
        const bridge = packCall(
          (cause) =>
            new ProviderAdapterOpenSessionError({
              driver,
              providerSessionId: value.providerSessionId,
              cause,
            }),
        );
        const encoded = yield* bridge.encode(PackCodec.openSessionInput, value);
        const mcp = yield* readPackMcpSession(mcpSessions, value.threadId);
        const closePack = (runtime: PackSessionRuntime) =>
          bridge
            .call(() => runtime.close())
            .pipe(
              Effect.timeout(CLOSE_TIMEOUT),
              Effect.catchCause((cause) =>
                Effect.logWarning("Pack provider session close() failed or timed out", {
                  driver,
                  instanceId,
                  cause,
                }),
              ),
            );
        let opening: Promise<PackSessionRuntime> | undefined;
        // Only the wait for the pack is interruptible: once it resolves, its close() finalizer is
        // registered in the same uninterruptible step, so no session escapes the scope.
        const runtime = yield* Effect.uninterruptibleMask((restore) =>
          restore(
            bridge.call(() => {
              opening = adapter.openSession({
                ...asPack<Omit<PackOpenSessionInput, "mcp" | "host">>(encoded),
                ...mcp,
                host: {
                  requestContinuation: (request) => {
                    // The host queue is unbounded and needs no services: a plain fork is enough.
                    Effect.runFork(input.offerContinuation(toContinuationRequest(driver, request)));
                  },
                  ...(mcpAppSnapshot === undefined ? {} : { mcpApps: PACK_MCP_APPS_HOST }),
                },
              });
              return opening;
            }),
          ).pipe(
            // Interrupted mid-open: the pack's Promise is abandoned, so close whatever session it
            // still resolves to (a rejection opened nothing).
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                void opening?.then(
                  (late) => Effect.runFork(closePack(late)),
                  () => undefined,
                );
              }),
            ),
            Effect.tap((opened) => Effect.addFinalizer(() => closePack(opened))),
          ),
        );
        const closed = yield* Deferred.make<void>();
        // LIFO: end the event stream first, then close the pack session (bounded).
        yield* Effect.addFinalizer(() => Deferred.succeed(closed, undefined));
        const providerSession = yield* bridge.decode(PackCodec.providerSession, {
          ...runtime.providerSession,
          id: value.providerSessionId,
          driver,
          providerInstanceId: instanceId,
        });
        return makePackSessionRuntime({
          runtime,
          driver,
          instanceId,
          mcpSessions,
          ...(mcpAppSnapshot === undefined ? {} : { mcpAppSnapshot }),
          providerSessionId: value.providerSessionId,
          providerSession,
          closed: Deferred.await(closed),
        });
      }),
  };
};
