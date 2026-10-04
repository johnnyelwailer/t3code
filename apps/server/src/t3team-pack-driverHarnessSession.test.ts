/**
 * The `createOpenCodeHarness` double bridge (host adapter -> pack JSON -> host adapter) must keep
 * every optional session probe the inner runtime exposes; the session manager's idle release and
 * the run executor's root stop gate read them.
 */
import { describe, expect, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
  type OrchestrationV2ProviderThread,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import type {
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2Shape,
} from "./orchestration-v2/ProviderAdapter.ts";
import {
  CAPABILITIES_JSON,
  NOW,
  PACK_DRIVER,
  providerThreadJson,
} from "./t3team-pack-driver.fixtures.ts";
import { makePackOrchestrationAdapter } from "./t3team-pack-driverAdapter.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
import { adapterToPack } from "./t3team-pack-driverHarnessSession.ts";
import { restampAdapter } from "./t3team-pack-driverRestamp.ts";

const INNER = ProviderDriverKind.make("opencode");
const OUTER = ProviderDriverKind.make(PACK_DRIVER);
const instanceId = ProviderInstanceId.make(PACK_DRIVER);
const threadId = ThreadId.make("thread-1");
const providerSessionId = ProviderSessionId.make("provider-session-1");
const modelSelection = { instanceId, model: "example/model" };
const runtimePolicy = {
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/work",
} as const;

const unused = () => Effect.die("unused in this test");
const decodeCapabilities = Schema.decodeUnknownEffect(PackCodec.capabilities);
const decodeSession = Schema.decodeUnknownEffect(PackCodec.providerSession);
const decodeThread = Schema.decodeUnknownEffect(PackCodec.providerThread);

/** A host (inner) adapter whose sessions report background work through both probes. */
const makeInnerAdapter = (probes: {
  readonly busy: () => boolean;
  readonly seen: OrchestrationV2ProviderThread[];
}): ProviderAdapterV2Shape => ({
  instanceId,
  driver: INNER,
  getCapabilities: () => decodeCapabilities(CAPABILITIES_JSON),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" }),
  openSession: (input) =>
    decodeSession({
      id: input.providerSessionId,
      driver: INNER,
      providerInstanceId: instanceId,
      status: "ready",
      cwd: "/work",
      model: null,
      capabilities: CAPABILITIES_JSON,
      createdAt: NOW,
      updatedAt: NOW,
      lastError: null,
    }).pipe(
      Effect.orDie,
      Effect.map((providerSession): ProviderAdapterV2SessionRuntime => ({
        instanceId,
        driver: INNER,
        providerSessionId: input.providerSessionId,
        providerSession,
        events: Stream.never,
        hasPendingBackgroundWork: Effect.sync(probes.busy),
        hasPendingBackgroundWorkForThread: (providerThread) =>
          Effect.sync(() => {
            probes.seen.push(providerThread);
            return probes.busy();
          }),
        ensureThread: unused,
        resumeThread: unused,
        startTurn: unused,
        steerTurn: unused,
        interruptTurn: unused,
        respondToRuntimeRequest: unused,
        readThreadSnapshot: unused,
        rollbackThread: unused,
        forkThread: unused,
      })),
    ),
});

describe("createOpenCodeHarness session bridge", () => {
  it.effect("keeps both background-work probes across the double bridge", () =>
    Effect.gen(function* () {
      let busy = true;
      const seen: OrchestrationV2ProviderThread[] = [];
      const inner = restampAdapter(makeInnerAdapter({ busy: () => busy, seen }), OUTER);
      const outer = makePackOrchestrationAdapter({
        adapter: adapterToPack(inner, Context.empty()),
        driver: OUTER,
        instanceId,
        offerContinuation: () => Effect.void,
      });
      const sessionScope = yield* Scope.make();
      const runtime = yield* outer
        .openSession({ threadId, providerSessionId, modelSelection, runtimePolicy })
        .pipe(Effect.provideService(Scope.Scope, sessionScope));
      const providerThread = yield* decodeThread(providerThreadJson(threadId, providerSessionId));

      expect(runtime.hasPendingBackgroundWork).toBeDefined();
      expect(runtime.hasPendingBackgroundWorkForThread).toBeDefined();
      expect(yield* runtime.hasPendingBackgroundWork!).toBe(true);
      expect(yield* runtime.hasPendingBackgroundWorkForThread!(providerThread)).toBe(true);
      // The inner runtime sees the provider thread under its own identity.
      expect(seen.map((thread) => [thread.id, thread.driver])).toEqual([
        [providerThread.id, INNER],
      ]);

      busy = false;
      expect(yield* runtime.hasPendingBackgroundWork!).toBe(false);
      expect(yield* runtime.hasPendingBackgroundWorkForThread!(providerThread)).toBe(false);
    }),
  );
});
