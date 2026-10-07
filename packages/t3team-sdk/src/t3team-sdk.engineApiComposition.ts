/** Imported composition API; execution stays in the host-neutral core. */
import type { CompositionOptions, PipelineStages } from "@runbook/core/composition";
import { fromRun } from "./t3team-sdk.engineApi.ts";

/**
 * Tuple-preserving, so `const [a, b] = await parallel([…])` keeps each thunk's own type instead of
 * collapsing to a union. `null` is in the element type because a failing thunk resolves to null
 * rather than rejecting the whole fanout. Pass `{ concurrency: N }` to cap active thunks;
 * omit it for unbounded execution. N must be a positive finite integer. Results retain input order.
 * The cap is journaled: changing it on resume causes journal drift.
 */
export function parallel<const T extends ReadonlyArray<() => unknown>>(
  thunks: T,
  options?: CompositionOptions,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> | null }> {
  return fromRun<
    (
      t: T,
      options?: CompositionOptions,
    ) => Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> | null }>
  >("parallel")(thunks, options);
}

/**
 * `pipeline(items, ...stages, { concurrency: N })` runs each item's stages in sequence,
 * with items in parallel. Each stage is `(prev, item, index) => value | Promise<value>`.
 * A trailing `{ concurrency: N }`
 * caps active item chains (positive finite integer); omission is unbounded. Results retain item
 * order; a failed chain yields null, a suspension rethrows. Changing the cap causes journal drift.
 */
export function pipeline(
  items: ReadonlyArray<unknown>,
  ...stages: PipelineStages
): Promise<unknown[]> {
  return fromRun<(items: ReadonlyArray<unknown>, ...stages: PipelineStages) => Promise<unknown[]>>(
    "pipeline",
  )(items, ...stages);
}
