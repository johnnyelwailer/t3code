/**
 * `it.effect` for this package's tests on the package's own `vite-plus/test` runner.
 *
 * `@effect/vitest` resolves the workspace's TypeScript-7 `vite-plus` peer variant, while this
 * package pins TypeScript 6 (it drives the compiler API), so its runner is a different vitest
 * instance and `@effect/vitest` tests fail with "failed to find the current suite".
 */
import * as Effect from "effect/Effect";
import { it as vpIt } from "vite-plus/test";

export { assert } from "vite-plus/test";

export const it = {
  effect: <A, E>(name: string, self: () => Effect.Effect<A, E>) =>
    vpIt(name, () => Effect.runPromise(Effect.asVoid(self()))),
};
