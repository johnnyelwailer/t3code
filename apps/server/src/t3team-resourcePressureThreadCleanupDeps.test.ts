import { assert, it } from "@effect/vitest";
import {
  type OrchestrationV2ServerCommand,
  ProviderSessionId,
  ProviderThreadId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { makeThreadCleanupDeps } from "./t3team-resourcePressureThreadCleanupDeps.ts";

const live = ThreadId.make("thread:live");
const dead = ThreadId.make("thread:dead");
const liveSession = ProviderSessionId.make("session:live");
const deadSession = ProviderSessionId.make("session:dead");

const recordsOf = (threadId: ThreadId) => {
  const providerSessionId = threadId === live ? liveSession : deadSession;
  const providerThreadId = ProviderThreadId.make(`pt:${threadId}`);
  return {
    thread: { id: threadId, activeProviderThreadId: providerThreadId },
    providerThreads: [{ id: providerThreadId, driver: "codex", providerSessionId }],
  };
};

const dispatched: OrchestrationV2ServerCommand[] = [];
const Mocks = Layer.mergeAll(
  Layer.mock(ThreadManagementService)({
    getThreadRecords: (threadId) => Effect.succeed(recordsOf(threadId) as never),
    dispatch: (command) =>
      Effect.sync(() => {
        dispatched.push(command);
        return { sequence: 1, storedEvents: [] } as never;
      }),
  }),
  Layer.mock(ProviderSessionManagerV2)({
    get: (providerSessionId) =>
      Effect.succeed(providerSessionId === liveSession ? Option.some({} as never) : Option.none()),
  }),
);

const base = {
  enabled: true,
  serverPid: 1,
  telemetry: { refresh: Effect.die("unused") },
  signal: () => Effect.die("unused"),
};

it.effect("resolves only a LIVE session, lists no jobs without job control, detaches", () =>
  Effect.gen(function* () {
    const deps = yield* makeThreadCleanupDeps(base);
    assert.deepStrictEqual(yield* deps.liveSession(live), {
      providerSessionId: liveSession,
      provider: "codex",
    });
    // A recorded but not running session is no session: nothing to stop.
    assert.isNull(yield* deps.liveSession(dead));
    // The fake runtime exposes no jobControl → unsupported → no jobs, never a failure.
    assert.deepStrictEqual(yield* deps.listJobs(live), []);
    assert.isTrue(yield* deps.stopSession({ threadId: live, providerSessionId: liveSession }));
    assert.strictEqual(dispatched.length, 1);
    const command = dispatched[0]!;
    assert.strictEqual(command.type, "provider-session.detach");
    if (command.type === "provider-session.detach") {
      assert.strictEqual(command.providerSessionId, liveSession);
      assert.strictEqual(command.threadId, live);
    }
  }).pipe(Effect.provide(Mocks)),
);
