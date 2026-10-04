/**
 * Maps one open pack session (`@t3team/pack-api` `PackSessionRuntime`) onto the host's
 * `ProviderAdapterV2SessionRuntime`: turns, steering, interrupts, runtime-request answers,
 * per-job control and per-turn MCP access. Thread operations live in
 * `t3team-pack-driverSessionThreads.ts`, background-work probes in
 * `t3team-pack-driverSessionProbes.ts`, events in `t3team-pack-driverEvents.ts`.
 *
 * @module t3team-pack-driverSession
 */
import type { PackSessionRuntime, PackTurnInput } from "@t3team/pack-api";
import type {
  OrchestrationV2ProviderSession,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  ProviderAdapterInterruptError,
  ProviderAdapterProtocolError,
  ProviderAdapterRuntimeRequestResponseError,
  ProviderAdapterSteerRunError,
  ProviderAdapterSteerRunUnsupportedError,
  ProviderAdapterTurnStartError,
  type ProviderAdapterV2SessionRuntime,
  type ProviderAdapterV2TurnInput,
} from "./orchestration-v2/ProviderAdapter.ts";
import { packCall, packRoundTrip } from "./t3team-pack-driverCall.ts";
import { asPack, PackCodec } from "./t3team-pack-driverCodec.ts";
import { packEventsToStream } from "./t3team-pack-driverEvents.ts";
import { withPackMcp } from "./t3team-pack-driverMcp.ts";
import { makePackSessionProbes } from "./t3team-pack-driverSessionProbes.ts";
import { makePackThreadOps } from "./t3team-pack-driverSessionThreads.ts";

type TurnJson = Omit<PackTurnInput, "mcp">;
type SteerJson = Omit<Parameters<NonNullable<PackSessionRuntime["steerTurn"]>>[0], "mcp">;

export const makePackSessionRuntime = (input: {
  readonly runtime: PackSessionRuntime;
  readonly driver: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly providerSessionId: ProviderSessionId;
  readonly providerSession: OrchestrationV2ProviderSession;
  /** Completes when the session scope closes; ends the event stream. */
  readonly closed: Effect.Effect<void>;
}): ProviderAdapterV2SessionRuntime => {
  const { runtime, driver, providerSessionId } = input;
  const turnError = (value: ProviderAdapterV2TurnInput) => (cause: unknown) =>
    new ProviderAdapterTurnStartError({
      driver,
      threadId: value.threadId,
      providerThreadId: value.providerThread.id,
      runId: value.runId,
      cause,
    });
  const runTurn =
    (method: (encoded: PackTurnInput) => Promise<void>) => (value: ProviderAdapterV2TurnInput) => {
      const bridge = packCall(turnError(value));
      return bridge
        .encode(PackCodec.turnInput, value)
        .pipe(
          Effect.flatMap((encoded) =>
            bridge.call(() => method(withPackMcp(asPack<TurnJson>(encoded), value.threadId))),
          ),
        );
    };
  const compact = runtime.compactThread;
  const steer = runtime.steerTurn;
  const jobControl = runtime.jobControl;
  return {
    instanceId: input.instanceId,
    driver,
    providerSessionId,
    providerSession: input.providerSession,
    events: packEventsToStream({
      events: () => runtime.events(),
      driver,
      providerSessionId,
      closed: input.closed,
    }),
    ...makePackSessionProbes(runtime, driver),
    ...makePackThreadOps({ runtime, driver, providerSessionId }),
    startTurn: runTurn((encoded) => runtime.startTurn(encoded)),
    ...(compact === undefined
      ? {}
      : { compactThread: runTurn((encoded) => compact.call(runtime, encoded)) }),
    steerTurn: (value) => {
      if (steer === undefined) {
        return Effect.fail(
          new ProviderAdapterSteerRunUnsupportedError({
            driver,
            providerThreadId: value.providerThread.id,
          }),
        );
      }
      const bridge = packCall(
        (cause) =>
          new ProviderAdapterSteerRunError({
            driver,
            providerThreadId: value.providerThread.id,
            providerTurnId: value.providerTurnId,
            cause,
          }),
      );
      return bridge
        .encode(PackCodec.steerInput, value)
        .pipe(
          Effect.flatMap((encoded) =>
            bridge.call(() =>
              steer.call(runtime, withPackMcp(asPack<SteerJson>(encoded), value.threadId)),
            ),
          ),
        );
    },
    interruptTurn: (value) => {
      const bridge = packCall(
        (cause) =>
          new ProviderAdapterInterruptError({
            driver,
            providerThreadId: value.providerThread.id,
            providerTurnId: value.providerTurnId,
            cause,
          }),
      );
      return bridge
        .encode(PackCodec.interruptInput, value)
        .pipe(
          Effect.flatMap((encoded) => bridge.call(() => runtime.interruptTurn(asPack(encoded)))),
        );
    },
    respondToRuntimeRequest: (value) => {
      const bridge = packCall(
        (cause) =>
          new ProviderAdapterRuntimeRequestResponseError({
            driver,
            requestId: value.requestId,
            cause,
          }),
      );
      return bridge
        .encode(PackCodec.runtimeRequestResponse, value)
        .pipe(
          Effect.flatMap((encoded) =>
            bridge.call(() => runtime.respondToRuntimeRequest(asPack(encoded))),
          ),
        );
    },
    ...(jobControl === undefined
      ? {}
      : {
          jobControl: (value) =>
            packRoundTrip(
              packCall(
                (cause) =>
                  new ProviderAdapterProtocolError({ driver, detail: "jobControl failed", cause }),
              ),
              { codec: PackCodec.jobControlInput, value },
              (encoded) => jobControl.call(runtime, asPack(encoded)),
              PackCodec.jobControlResult,
            ),
        }),
  };
};
