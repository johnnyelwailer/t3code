import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ThreadId,
  type OrchestrationV2ShellSnapshot,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Atom, AtomRegistry } from "effect/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as Persistence from "../platform/persistence.ts";
import { v2ShellSnapshot, v2ThreadShell } from "./orchestrationV2TestFixtures.ts";
import {
  applyLocalThreadOverrides,
  createLocalThreadOverrides,
  isEnvironmentUnreachable,
} from "./t3team-localThreadOverrides.ts";

const ENVIRONMENT_ID = EnvironmentId.make("ended-cloud-session");
const NOW = DateTime.makeUnsafe("2026-10-30T09:00:00.000Z");
const KEPT = ThreadId.make("kept");
const STUCK = ThreadId.make("stuck");

const thread = (id: ThreadId): OrchestrationV2ThreadShell => ({ ...v2ThreadShell, id });
const SNAPSHOT: OrchestrationV2ShellSnapshot = {
  ...v2ShellSnapshot,
  threads: [thread(KEPT), thread(STUCK)],
  archivedThreads: [thread(ThreadId.make("archived-stuck"))],
};
const BASE = AVAILABLE_CONNECTION_STATE;
const blocked = (
  reason: "configuration" | "authentication" | "permission",
  failureCause?: ConnectionBlockedError["failureCause"],
): SupervisorConnectionState => ({
  ...BASE,
  phase: "blocked",
  lastFailure: new ConnectionBlockedError({
    reason,
    detail: "blocked",
    ...(failureCause === undefined ? {} : { failureCause }),
  }),
});

describe("isEnvironmentUnreachable", () => {
  it("treats an ended cloud session, whatever the platform presents, as unreachable", () => {
    expect(
      isEnvironmentUnreachable({
        inCatalog: true,
        state: blocked("configuration", "session_ended"),
      }),
    ).toBe(true);
  });

  it("treats an environment missing from the catalog as unreachable", () => {
    expect(isEnvironmentUnreachable({ inCatalog: false, state: null })).toBe(true);
  });

  it("keeps environments that are expected to answer on the normal path", () => {
    // A live server behind an expired sign-in, a reconnect or a switched-off environment.
    expect(isEnvironmentUnreachable({ inCatalog: true, state: blocked("authentication") })).toBe(
      false,
    );
    expect(isEnvironmentUnreachable({ inCatalog: true, state: blocked("permission") })).toBe(false);
    for (const phase of ["available", "offline", "connecting", "backoff", "connected"] as const) {
      expect(isEnvironmentUnreachable({ inCatalog: true, state: { ...BASE, phase } })).toBe(false);
    }
    expect(isEnvironmentUnreachable({ inCatalog: true, state: null })).toBe(false);
  });
});

describe("applyLocalThreadOverrides", () => {
  it("removes a deleted thread, active or archived, and leaves the others alone", () => {
    const next = applyLocalThreadOverrides(
      SNAPSHOT,
      new Map([
        [STUCK, "removed"],
        [ThreadId.make("archived-stuck"), "removed"],
      ]),
      NOW,
    );
    expect(next.threads.map((entry) => entry.id)).toEqual([KEPT]);
    expect(next.archivedThreads).toEqual([]);
  });

  it("settles a thread locally without touching the others", () => {
    const next = applyLocalThreadOverrides(SNAPSHOT, new Map([[STUCK, "settled"]]), NOW);
    expect(next.threads.find((entry) => entry.id === STUCK)).toMatchObject({
      settledOverride: "settled",
      pinnedAt: null,
      snoozedUntil: null,
    });
    expect(next.threads.find((entry) => entry.id === KEPT)).toEqual(thread(KEPT));
  });

  it("returns the same snapshot when there is nothing to override", () => {
    expect(applyLocalThreadOverrides(SNAPSHOT, new Map(), NOW)).toBe(SNAPSHOT);
  });
});

describe("local override command", () => {
  const makeHarness = (cache: Partial<Persistence.EnvironmentCacheStore["Service"]>) => {
    const runtime = Atom.runtime(
      Layer.succeed(
        Persistence.EnvironmentCacheStore,
        cache as Persistence.EnvironmentCacheStore["Service"],
      ),
    );
    const sourceAtom = Atom.make(SNAPSHOT);
    const source = Atom.family((_environmentId: EnvironmentId) => sourceAtom);
    const local = createLocalThreadOverrides(runtime, source);
    const registry = AtomRegistry.make();
    registry.mount(local.snapshotAtom(ENVIRONMENT_ID));
    return {
      registry,
      local,
      sourceAtom,
      view: () => registry.get(local.snapshotAtom(ENVIRONMENT_ID)),
    };
  };

  it.effect("removes the thread from the view and from the cache, with the environment gone", () =>
    Effect.gen(function* () {
      const saved: OrchestrationV2ShellSnapshot[] = [];
      const removed: ThreadId[] = [];
      const h = makeHarness({
        loadShell: () => Effect.succeedSome(SNAPSHOT),
        saveShell: (_environmentId, snapshot) => Effect.sync(() => void saved.push(snapshot)),
        removeThread: (_environmentId, threadId) => Effect.sync(() => void removed.push(threadId)),
      });
      const result = yield* Effect.promise(() =>
        h.local.command.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: STUCK, override: "removed" },
        }),
      );
      expect(result._tag).toBe("Success");
      expect(h.view()?.threads.map((entry) => entry.id)).toEqual([KEPT]);
      expect(saved[0]?.threads.map((entry) => entry.id)).toEqual([KEPT]);
      expect(removed).toEqual([STUCK]);
    }),
  );

  it.effect("settles the thread locally and succeeds even when the cache write fails", () =>
    Effect.gen(function* () {
      const h = makeHarness({
        loadShell: () => Effect.die("cache unavailable"),
      });
      const result = yield* Effect.promise(() =>
        h.local.command.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: STUCK, override: "settled" },
        }),
      );
      expect(result._tag).toBe("Success");
      expect(h.view()?.threads.find((entry) => entry.id === STUCK)?.settledOverride).toBe(
        "settled",
      );
    }),
  );

  it.effect("ends the override once the environment answers again with a newer snapshot", () =>
    Effect.gen(function* () {
      const h = makeHarness({ loadShell: () => Effect.succeedNone });
      yield* Effect.promise(() =>
        h.local.command.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: STUCK, override: "removed" },
        }),
      );
      expect(h.view()?.threads.map((entry) => entry.id)).toEqual([KEPT]);
      // A new session on the same environment id serves a newer snapshot that still has the thread.
      h.registry.set(h.sourceAtom, {
        ...SNAPSHOT,
        snapshotSequence: SNAPSHOT.snapshotSequence + 1,
      });
      expect(h.view()?.threads.map((entry) => entry.id)).toEqual([KEPT, STUCK]);
    }),
  );
});
