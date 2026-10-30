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

import type { EnvironmentConnectionPhase } from "../connection/presentation.ts";
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
const presentation = (phase: EnvironmentConnectionPhase) => ({ connection: { phase } });

describe("isEnvironmentUnreachable", () => {
  it("treats a switched-off, blocked (ended cloud session) or unknown environment as unreachable", () => {
    expect(isEnvironmentUnreachable(presentation("available"))).toBe(true);
    expect(isEnvironmentUnreachable(presentation("error"))).toBe(true);
    expect(isEnvironmentUnreachable(null)).toBe(true);
  });

  it("keeps environments that are expected to answer on the normal path", () => {
    for (const phase of [
      "connecting",
      "reconnecting",
      "connected",
      "offline",
      "unsupported",
    ] as const) {
      expect(isEnvironmentUnreachable(presentation(phase))).toBe(false);
    }
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
    const source = Atom.family((_environmentId: EnvironmentId) => Atom.make(SNAPSHOT));
    const local = createLocalThreadOverrides(runtime, source);
    const registry = AtomRegistry.make();
    registry.mount(local.snapshotAtom(ENVIRONMENT_ID));
    return { registry, local, view: () => registry.get(local.snapshotAtom(ENVIRONMENT_ID)) };
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
});
