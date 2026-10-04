import type {
  ResourcePressureEvent,
  ResourcePressureSnapshot,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type { ResourcePressureEventRepositoryShape } from "./persistence/Services/t3team-ResourcePressureEvents.ts";
import { bucketByClass, descendsFrom, indexByPid } from "./t3team-resourcePressureClasses.ts";
import {
  classifyPressure,
  topConsumers,
  type HysteresisState,
} from "./t3team-resourcePressureModel.ts";
import { processEntry, telemetry } from "./t3team-resourcePressureTestFixtures.ts";
import { makeSampleOnce } from "./t3team-resourcePressureSample.ts";
import { sweepStorageNow } from "./t3team-resourcePressureSweep.ts";

const GIB = 1024 ** 3;

// server 10 → electron renderer 20 (app proper); agent CLI 11 → tool 12 → build 13; orphan 99.
const tree = telemetry([
  processEntry(10, 1 * GIB, "server", 1),
  processEntry(20, 2 * GIB, "electron-renderer", 1),
  processEntry(11, 3 * GIB, "provider-root", 10),
  processEntry(12, 1 * GIB, "server-child", 11),
  processEntry(13, 1 * GIB, "server-child", 12),
  processEntry(99, 1 * GIB, "server-child", 4242),
]);

describe("process classes (spec delta 1 + 6)", () => {
  it("splits app proper, app spawned and rest of machine", () => {
    const classes = bucketByClass({
      telemetry: tree,
      totalMemoryBytes: 48 * GIB,
      availableMemoryBytes: 30 * GIB,
    });
    assert.deepStrictEqual(classes.appProper, {
      rssBytes: 3 * GIB,
      processCount: 2,
      serverRssBytes: 1 * GIB,
      rendererRssBytes: 2 * GIB,
    });
    assert.deepStrictEqual(classes.appSpawned, {
      rssBytes: 6 * GIB,
      processCount: 4,
      agentSessionCount: 1,
      agentSpawnedProcessCount: 2,
    });
    // used 18 GiB − T3 tree 9 GiB.
    assert.strictEqual(classes.restOfMachineBytes, 9 * GIB);
  });
});

describe("kill lineage (spec delta 3)", () => {
  it("walks the ppid chain to the server and rejects orphans", () => {
    const byPid = indexByPid(tree);
    assert.isTrue(descendsFrom(13, 10, byPid));
    assert.isFalse(descendsFrom(99, 10, byPid));
    const signalable = new Map(topConsumers(tree, 10).map((c) => [c.pid, c.signalable]));
    assert.isTrue(signalable.get(11));
    assert.isTrue(signalable.get(13));
    assert.isFalse(signalable.get(99), "server-child category but lineage does not reach server");
    assert.isFalse(signalable.get(20), "app proper is never offered");
    assert.isFalse(signalable.get(10), "never the server itself");
  });

  it("terminates on a ppid cycle", () => {
    const cyclic = telemetry([
      processEntry(5, 1, "server-child", 6),
      processEntry(6, 1, "server-child", 5),
    ]);
    assert.isFalse(descendsFrom(5, 10, indexByPid(cyclic)));
  });
});

describe("darwin kernel-read failure", () => {
  it("does not fall back to the vm_stat fraction on darwin", () => {
    const host = { totalMemoryBytes: 16 * GIB, availableMemoryBytes: 0.5 * GIB };
    const result = classifyPressure({ host, osLevel: null, appTreeRssBytes: 0, darwin: true });
    assert.strictEqual(result.level, "ok");
    assert.include(result.reasons.join(" "), "unavailable");
    assert.strictEqual(
      classifyPressure({ host, osLevel: null, appTreeRssBytes: 0 }).level,
      "critical",
      "non-darwin still uses the fraction",
    );
  });
});

// Spec delta 2 (dispatch backoff) is no longer a refusal: spawns always run, their results carry
// the pressure line, and critical pressure holds turns at the boundary. See
// t3team-resourcePressurePush.test.ts and t3team-resourcePressureAutoPause.test.ts.

describe("sweep now (spec delta 5)", () => {
  it.effect("runs the existing storage sweep only when enabled and available", () =>
    Effect.gen(function* () {
      let sweeps = 0;
      const cleanup = Option.some({
        start: () => Effect.void,
        drain: Effect.void,
        sweepNow: Effect.sync(() => void (sweeps += 1)),
      });
      assert.isFalse((yield* sweepStorageNow(cleanup, false)).swept);
      assert.strictEqual(sweeps, 0);
      assert.isFalse((yield* sweepStorageNow(Option.none(), true)).swept);
      assert.isTrue((yield* sweepStorageNow(cleanup, true)).swept);
      assert.strictEqual(sweeps, 1);
    }),
  );
});

describe("sample step", () => {
  const events: ResourcePressureEvent[] = [];
  const repo: ResourcePressureEventRepositoryShape = {
    append: (event) => Effect.sync(() => void events.unshift({ ...event, id: events.length + 1 })),
    listRecent: ({ limit }) => Effect.succeed(events.slice(0, limit)),
    readAccumulation: Effect.succeed({ worktreeThreadCount: 0, archivedWorktreeThreadCount: 0 }),
  };
  const deps = (input: { readonly level: "ok" | "critical"; readonly refreshFails: boolean }) =>
    Effect.gen(function* () {
      const snapshot = { ...tree, readAt: DateTime.makeUnsafe(0) } as ResourceTelemetrySnapshot;
      return {
        hostResources: {
          read: Effect.succeed({
            sampledAt: 0,
            cpuUtilization: null,
            cpuCount: 8,
            availableMemoryBytes: 40 * GIB,
            totalMemoryBytes: 48 * GIB,
          }),
        },
        telemetry: {
          refresh: input.refreshFails ? Effect.fail("sidecar down") : Effect.succeed(snapshot),
          latest: Effect.succeed(snapshot),
        } as never,
        events: repo,
        readOsLevel: Effect.succeed("normal" as const),
        darwin: true,
        serverPid: 10,
        sampleIntervalMs: 20_000,
        latest: yield* Ref.make<ResourcePressureSnapshot | null>(null),
        hysteresis: yield* Ref.make<HysteresisState>({ level: input.level, lowerStreak: 0 }),
      };
    });

  it.effect("a restart seeded at critical holds and journals nothing new; stale is flagged", () =>
    Effect.gen(function* () {
      events.length = 0;
      const d = yield* deps({ level: "critical", refreshFails: true });
      yield* makeSampleOnce(d);
      const published = yield* Ref.get(d.latest);
      assert.strictEqual(events.length, 0, "no phantom ok → critical transition");
      assert.strictEqual(published?.level, "critical", "held by hysteresis");
      assert.include(published?.reasons.join(" ") ?? "", "holding critical");
      assert.strictEqual(published?.processDataStale, true, "refresh failed → stale flagged");
      assert.include(published?.reasons.join(" ") ?? "", "process scan unavailable");
    }),
  );
});
