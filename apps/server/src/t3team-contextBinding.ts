/**
 * `t3team.contextBinding.record`: the thread is resolved server-side and the binding's project
 * must be the thread's own. A refusal stores nothing; a thread keeps the first binding it gets.
 */
import {
  T3TEAM_CONTEXT_BINDING_FACT_KEY,
  T3TeamContextBinding,
  T3TeamContextBindingError,
  readThreadContextBinding,
  type T3TeamContextBindingRecordInput,
  type T3TeamContextBindingRecordResult,
} from "@t3tools/contracts";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { featureDisabledMessage } from "./t3team-featureFlagRoute.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

const sameBinding = Schema.toEquivalence(T3TeamContextBinding);

const fail = (message: string) => new T3TeamContextBindingError({ message });

export const recordContextBinding = Effect.fn("t3team.contextBinding.record")(function* (
  input: T3TeamContextBindingRecordInput,
  factsStore: T3TeamThreadFactsStore["Service"] | undefined,
) {
  if (!readFeatureFlag("CONTEXT_CHAT_TAB")) {
    return yield* fail(featureDisabledMessage("CONTEXT_CHAT_TAB"));
  }
  if (factsStore === undefined) return yield* fail("Thread facts are unavailable here.");
  const { project } = yield* loadThreadProjectContext(input.threadId).pipe(
    Effect.mapError(() => fail("The thread was not found.")),
  );
  if (input.binding.projectId !== project.id) {
    return yield* fail("The binding is for another project than the thread's.");
  }
  const failStore = () => fail("Could not record the context binding.");
  const current = yield* factsStore.get(input.threadId).pipe(Effect.mapError(failStore));
  const existing = readThreadContextBinding(current ?? undefined);
  if (existing !== null && !sameBinding(existing, input.binding)) {
    return yield* fail("The thread is already bound to another context.");
  }
  yield* factsStore
    .upsert(input.threadId, { extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: input.binding } })
    .pipe(Effect.mapError(failStore));
  return { binding: input.binding } satisfies T3TeamContextBindingRecordResult;
});
