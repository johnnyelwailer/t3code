import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";

import { withMainRepositoryInspectionClaim } from "./t3team-mainRepositoryInspection.ts";

describe("withMainRepositoryInspectionClaim", () => {
  it.effect(
    "lets one inspection per project run at a time, and frees the claim however it ends",
    () =>
      Effect.gen(function* () {
        const root = "/projects/alpha/.nexi/references";
        const release = yield* Deferred.make<void>();
        let runs = 0;
        const inspect = Effect.sync(() => (runs += 1)).pipe(
          Effect.andThen(Deferred.await(release)),
        );
        const first = yield* Effect.forkChild(withMainRepositoryInspectionClaim(root, inspect));
        yield* Effect.yieldNow;
        // A concurrent creation of the same project skips; another project does not wait on it.
        expect(yield* withMainRepositoryInspectionClaim(root, inspect)).toEqual(Option.none());
        expect(
          Option.isSome(yield* withMainRepositoryInspectionClaim("/projects/beta", Effect.void)),
        ).toBe(true);
        yield* Deferred.succeed(release, undefined);
        expect(Option.isSome(yield* Fiber.join(first))).toBe(true);
        expect(runs).toBe(1);
        // A failed inspection frees the claim too: the next one runs.
        yield* withMainRepositoryInspectionClaim(root, Effect.fail("unreachable")).pipe(
          Effect.flip,
        );
        expect(Option.isSome(yield* withMainRepositoryInspectionClaim(root, Effect.void))).toBe(
          true,
        );
      }),
  );
});
