// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
/**
 * Waiting on an on-demand sync: concurrent callers for one repository join one job, and a caller
 * that gives up after its wait cap leaks nothing while the sync finishes in the background.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { syncLinkedRepositoryOnDemand } from "./t3team-linkedRepositoryOnDemand.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { bootstrap, makeHarness, makeOrigin } from "./t3team-linkedRepositorySync.fixtures.ts";
import { readLinkedRepositoryStatus } from "./t3team-project-repository-routesStatus.ts";

const run = <A, E>(
  harness: ReturnType<typeof makeHarness>,
  effect: Effect.Effect<A, E, Layer.Success<ReturnType<typeof makeHarness>["layer"]>>,
) => effect.pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));

describe("waiting on an on-demand linked repository sync", () => {
  it.live("two concurrent agent calls for one repository join one clone", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "joined");
    return run(
      harness,
      Effect.gen(function* () {
        const gate = yield* harness.holdClones();
        yield* bootstrap(harness.workspaceRoot, [url]);
        const call = syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: url,
          wait: true,
        });
        const both = yield* Effect.forkChild(
          Effect.all([call, call], { concurrency: "unbounded" }),
        );
        yield* Effect.yieldNow;
        yield* Deferred.succeed(gate, undefined);
        const [first, second] = yield* Fiber.join(both);
        expect(harness.counts.clone).toBe(1);
        expect(first.view).toMatchObject({ state: "cloned" });
        expect(second.view.localPath).toBe(first.view.localPath);
      }),
    );
  });

  it.live("stops waiting after the wait timeout while the clone keeps going", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "slow");
    return run(
      harness,
      Effect.gen(function* () {
        const gate = yield* harness.holdClones();
        yield* bootstrap(harness.workspaceRoot, [url]);
        const error = yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: url,
          wait: true,
          waitTimeoutMs: 50,
        }).pipe(Effect.flip);
        expect(error.message).toContain("timed out after");
        const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
          .linkedRepositories;
        expect(entry?.syncState).toBe("cloning");
        yield* Deferred.succeed(gate, undefined);
        yield* Effect.flatMap(T3TeamLinkedRepositorySync, (sync) =>
          sync.awaitSettled(entry!.localPath),
        );
        expect(harness.counts.clone).toBe(1);
        // The caller that gave up leaks nothing: the job left the registry, its outcome is
        // recorded, and no half-finished temp clone is left next to the checkout.
        expect((yield* T3TeamLinkedRepositorySync).phase(entry!.localPath)).toBeUndefined();
        const [settled] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
          .linkedRepositories;
        expect(settled?.status).toBe("cloned");
        const references = NodePath.dirname(entry!.localPath);
        expect(NodeFS.readdirSync(references).filter((name) => name.includes(".clone-"))).toEqual(
          [],
        );
      }),
    );
  });
});
