/**
 * Pack providers join upstream's usage pipeline: an `account.rate-limits.updated`
 * merge lands on the snapshot and is republished, and a pack's own
 * `subscribeSnapshot` pushes reach `streamChanges`.
 */
import { assert, describe, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import type { PackProviderInstance, PackProviderSnapshot } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { makePackProviderSnapshot } from "./t3team-pack-driverSnapshotShape.ts";

const baseSnapshot: PackProviderSnapshot = {
  displayName: "Nexplore AI",
  enabled: true,
  installed: true,
  status: "ready",
  authenticated: true,
  models: [{ slug: "auto", name: "Standard" }],
};

const makeInstance = () => {
  let listener: ((snapshot: PackProviderSnapshot) => void) | undefined;
  const instance = {
    snapshot: () => baseSnapshot,
    subscribeSnapshot: (next: (snapshot: PackProviderSnapshot) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  } as unknown as PackProviderInstance;
  return { instance, push: (snapshot: PackProviderSnapshot) => listener?.(snapshot) };
};

const input = (packInstance: PackProviderInstance) => ({
  packInstance,
  driverKind: ProviderDriverKind.make("nexplore"),
  instanceId: ProviderInstanceId.make("nexplore"),
  displayName: undefined,
  accentColor: undefined,
  iconDataUrl: undefined,
  continuationKey: "pack:nexplore",
});

describe("makePackProviderSnapshot", () => {
  it.effect("merges a runtime usage update into the snapshot and republishes it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { instance } = makeInstance();
        const shape = yield* makePackProviderSnapshot(input(instance));
        const next = yield* shape.streamChanges.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        yield* shape.applyUsageLimits({
          checkedAt: "2026-09-28T10:00:00.000Z",
          windows: [{ id: "daily", kind: "session", label: "Daily", usedPercent: 85 }],
        });
        const [published] = yield* Fiber.join(next);
        assert.strictEqual(published?.usageLimits?.windows[0]?.usedPercent, 85);
        const snapshot = yield* shape.getSnapshot;
        assert.strictEqual(snapshot.usageLimits?.windows[0]?.id, "daily");
      }),
    ),
  );

  it.effect("forwards the pack's own snapshot pushes onto streamChanges", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { instance, push } = makeInstance();
        const shape = yield* makePackProviderSnapshot(input(instance));
        const next = yield* shape.streamChanges.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        push({ ...baseSnapshot, displayName: "Nexplore AI (renamed)" });
        const [published] = yield* Fiber.join(next);
        assert.strictEqual(published?.displayName, "Nexplore AI (renamed)");
      }),
    ),
  );
});
