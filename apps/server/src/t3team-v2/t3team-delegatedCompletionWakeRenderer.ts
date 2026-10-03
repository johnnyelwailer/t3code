/**
 * Renderer hook for the delegated-completion wake message
 * (`ProviderContinuationService`). Upstream's text only says that delegated
 * tasks reached a terminal state and points at `task_status`; a fork or pack
 * layer can override this reference to inline each child's status, failure
 * reason and result summary so an orchestrating agent is told what happened
 * without a tool round trip.
 *
 * Contract:
 * - `render` receives the parent thread, the parent run whose tasks completed,
 *   the delegated task ids and upstream's default text; it returns the wake
 *   message text. Return `defaultText` to keep upstream behaviour.
 * - It runs on the continuation worker, outside any thread lock: it may read
 *   projections (e.g. `ThreadManagementService.getThreadRecords(threadId,
 *   ["subagents"])`) but must not dispatch commands.
 * - Failures and defects fall back to `defaultText`; the wake is never dropped.
 *
 * Register an override by providing it to the V2 runtime layer in server.ts:
 * `OrchestrationV2ProductionLayerLive.pipe(Layer.provide(myRendererLayer))`.
 */
import type { RunId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface DelegatedCompletionWakeInput {
  readonly threadId: ThreadId;
  readonly parentRunId: RunId;
  readonly taskIds: ReadonlyArray<string>;
  readonly defaultText: string;
}

export interface DelegatedCompletionWakeRendererShape {
  readonly render: (input: DelegatedCompletionWakeInput) => Effect.Effect<string>;
}

export class DelegatedCompletionWakeRenderer extends Context.Reference<DelegatedCompletionWakeRendererShape>(
  "t3team/v2/DelegatedCompletionWakeRenderer",
  {
    defaultValue: () => ({ render: (input) => Effect.succeed(input.defaultText) }),
  },
) {}

/** Renders through the current renderer, falling back to the default text on any failure. */
export const renderDelegatedCompletionWake = (
  renderer: DelegatedCompletionWakeRendererShape,
  input: DelegatedCompletionWakeInput,
): Effect.Effect<string> =>
  renderer.render(input).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("t3team.delegated-completion-wake.render-failed", {
        threadId: input.threadId,
        cause,
      }).pipe(Effect.as(input.defaultText)),
    ),
  );
