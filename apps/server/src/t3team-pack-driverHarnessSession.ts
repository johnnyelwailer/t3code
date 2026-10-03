/**
 * Host V2 adapter -> pack `PackOrchestrationAdapter` (Promise + JSON).
 *
 * Inner half of the `createOpenCodeHarness` double bridge: a pack composes the reviewed host
 * OpenCode adapter, decorates it in pack terms, and hands it back to the driver bridge, which maps
 * it onto `ProviderAdapterV2Shape` again (`t3team-pack-driverAdapter.ts`). Each method decodes the
 * pack's JSON input, runs the host Effect in the ambient driver context, and encodes the result.
 * A session's scope is owned here and closed by the pack's `close()`.
 *
 * @module t3team-pack-driverHarnessSession
 */
import type { PackJson, PackOrchestrationAdapter, PackSessionRuntime } from "@t3team/pack-api";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import type {
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2Shape,
} from "./orchestration-v2/ProviderAdapter.ts";
import { asPack, PackCodec } from "./t3team-pack-driverCodec.ts";

type Run = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;

const via =
  <I, IJ, O, E>(
    run: Run,
    input: Schema.Codec<I, IJ>,
    output: Schema.Codec<O, Schema.Json>,
    call: (value: I) => Effect.Effect<O, E>,
  ) =>
  <P>(json: unknown): Promise<P> =>
    run(
      Schema.decodeUnknownEffect(input)(json).pipe(
        Effect.flatMap(call),
        Effect.flatMap((value) => Schema.encodeEffect(output)(value)),
        Effect.map((encoded) => asPack<P>(encoded)),
      ),
    );

const viaVoid =
  <I, IJ, E>(run: Run, input: Schema.Codec<I, IJ>, call: (value: I) => Effect.Effect<void, E>) =>
  (json: unknown): Promise<void> =>
    run(Schema.decodeUnknownEffect(input)(json).pipe(Effect.flatMap(call)));

const sessionToPack = (
  runtime: ProviderAdapterV2SessionRuntime,
  run: Run,
  ambient: Context.Context<never>,
  scope: Scope.Closeable,
): Promise<PackSessionRuntime> =>
  run(Schema.encodeEffect(PackCodec.providerSession)(runtime.providerSession)).then(
    (encodedSession) => {
      const providerSession = asPack<PackJson>(encodedSession);
      const { steerTurn, compactThread, injectHistory, unloadThread, jobControl } = runtime;
      const encodeEvent = Schema.encodeEffect(PackCodec.event);
      return {
        providerSession,
        events: () =>
          Stream.toAsyncIterableWith(
            runtime.events.pipe(Stream.mapEffect((event) => encodeEvent(event))),
            ambient,
          ),
        ensureThread: via(run, PackCodec.ensureThreadInput, PackCodec.providerThread, (value) =>
          runtime.ensureThread(value),
        ),
        resumeThread: via(run, PackCodec.resumeThreadInput, PackCodec.providerThread, (value) =>
          runtime.resumeThread(value),
        ),
        ...(injectHistory === undefined
          ? {}
          : {
              injectHistory: (json: unknown) =>
                run(
                  Schema.decodeUnknownEffect(PackCodec.injectHistoryInput)(json).pipe(
                    Effect.flatMap(injectHistory),
                  ),
                ),
            }),
        startTurn: viaVoid(run, PackCodec.turnInput, runtime.startTurn),
        ...(compactThread === undefined
          ? {}
          : { compactThread: viaVoid(run, PackCodec.turnInput, compactThread) }),
        steerTurn: viaVoid(run, PackCodec.steerInput, steerTurn),
        interruptTurn: viaVoid(run, PackCodec.interruptInput, runtime.interruptTurn),
        ...(unloadThread === undefined
          ? {}
          : { unloadThread: viaVoid(run, PackCodec.threadRef, unloadThread) }),
        respondToRuntimeRequest: viaVoid(
          run,
          PackCodec.runtimeRequestResponse,
          runtime.respondToRuntimeRequest,
        ),
        readThreadSnapshot: via(
          run,
          PackCodec.threadRef,
          PackCodec.threadSnapshot,
          runtime.readThreadSnapshot,
        ),
        rollbackThread: via(
          run,
          PackCodec.rollbackInput,
          PackCodec.threadSnapshot,
          runtime.rollbackThread,
        ),
        forkThread: via(run, PackCodec.forkInput, PackCodec.providerThread, runtime.forkThread),
        ...(jobControl === undefined
          ? {}
          : {
              jobControl: via(
                run,
                PackCodec.jobControlInput,
                PackCodec.jobControlResult,
                jobControl,
              ),
            }),
        close: () => run(Scope.close(scope, Exit.void)),
      } satisfies PackSessionRuntime;
    },
  );

export const adapterToPack = (
  adapter: ProviderAdapterV2Shape,
  ambient: Context.Context<never>,
): PackOrchestrationAdapter => {
  const run: Run = (effect) => Effect.runPromiseWith(ambient)(effect);
  return {
    getCapabilities: () =>
      run(
        adapter.getCapabilities().pipe(
          Effect.flatMap((capabilities) =>
            Schema.encodeEffect(PackCodec.capabilities)(capabilities),
          ),
          Effect.map((encoded) => asPack<PackJson>(encoded)),
        ),
      ),
    planSelectionTransition: via(
      run,
      PackCodec.selectionTransitionInput,
      PackCodec.selectionTransitionPlan,
      adapter.planSelectionTransition,
    ),
    openSession: (input) =>
      run(
        Effect.gen(function* () {
          const value = yield* Schema.decodeUnknownEffect(PackCodec.openSessionInput)(input);
          const scope = yield* Scope.make();
          const runtime = yield* adapter.openSession(value).pipe(
            Effect.provideService(Scope.Scope, scope),
            Effect.onError(() => Scope.close(scope, Exit.void)),
          );
          return { runtime, scope };
        }),
      ).then(({ runtime, scope }) => sessionToPack(runtime, run, ambient, scope)),
  };
};
