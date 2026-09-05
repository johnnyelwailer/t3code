/**
 * Wiring the report composer to the workspace utility model.
 *
 * There is exactly ONE utility-model seam in this repo and this uses it rather than adding a
 * second. What it is, quoted from where it lives:
 *
 *   • `packages/contracts/src/settings.ts:721` — `textGenerationModelSelection: ModelSelection`,
 *     defaulting to `{ instanceId: ProviderInstanceId.make("codex"), model:
 *     DEFAULT_TEXT_GENERATION_MODEL, options: [{ id: "reasoningEffort", ... }] }`. Read here
 *     through `ServerSettingsService.getSettings`, the same way `GitManager.ts:2248` reads it for
 *     commit-message generation and `ProviderCommandReactor.ts:81` reads it as the last step of
 *     its model cascade.
 *   • `apps/server/src/textGeneration/TextGeneration.ts:158` — the optional `generateStructured`
 *     method on the `TextGeneration` service, dispatched per provider instance by
 *     `resolveInstance` (line 227) to `ClaudeTextGeneration` / `CodexTextGeneration` /
 *     `CursorTextGeneration` / `GrokTextGeneration` / `OpenCodeTextGeneration`. Epic 24 names this
 *     pair as the composer's model seam: *"This is the natural pattern to extend, not duplicate."*
 *
 * The same pair already backs the engine's other model call — `generateRepairStructured` in
 * `t3team-toolBrokerWorkflowRunLive.ts:69` — so the composer is the second caller of one path,
 * not a new one. `generateStructured` is optional on the service (a driver may not support it),
 * and both services are resolved with `Effect.serviceOption`, so a host without them yields
 * `undefined` and the composer falls back structurally instead of failing.
 *
 * Epic 24 also specifies a future sibling setting (`composerModelSelection`) with recipe/pack
 * override cascading. That is deliberately NOT introduced here: nothing yet writes it, and an
 * unread setting is the "declared is not implemented" trap this repo keeps falling into.
 *
 * @module t3team-workflowReportComposerLive
 */
import type { ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ServerSettingsService } from "./serverSettings.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import type { GenerateWorkflowReport } from "./t3team-workflowReportCompose.ts";
import { WorkflowRunReport } from "./t3team-workflowReportTypes.ts";

export interface WorkflowReportComposerModel {
  readonly generate: GenerateWorkflowReport;
  readonly modelSelection: ModelSelection;
}

/**
 * Resolve the composer's model call, or `undefined` when this host has no utility model — no
 * `TextGeneration` service, a driver without `generateStructured`, or unreadable settings. Every
 * one of those is a fallback, never an error: the run's facts still reach the reader.
 */
export const makeWorkflowReportComposerModel = Effect.fn("makeWorkflowReportComposerModel")(
  function* () {
    const textGeneration = Option.getOrUndefined(yield* Effect.serviceOption(TextGeneration));
    if (textGeneration?.generateStructured === undefined) return undefined;
    const settingsService = Option.getOrUndefined(
      yield* Effect.serviceOption(ServerSettingsService),
    );
    if (settingsService === undefined) return undefined;
    const settings = yield* settingsService.getSettings.pipe(
      Effect.map(Option.some),
      Effect.orElseSucceed(() => Option.none()),
    );
    if (Option.isNone(settings)) return undefined;
    const modelSelection = settings.value.textGenerationModelSelection;
    return {
      modelSelection,
      generate: ({ prompt, instructions, modelSelection: selection }) =>
        Effect.runPromise(
          textGeneration.generateStructured!({
            cwd: process.cwd(),
            // The composer's instructions ride at the head of the prompt: `generateStructured`
            // takes one prompt and an output schema, with no separate system-instruction seam.
            // Isolation still holds — this call carries no thread, no tools, and no history.
            prompt: `${instructions}\n\n--- THE RUN ---\n\n${prompt}`,
            outputSchema: WorkflowRunReport,
            modelSelection: selection,
          }),
        ),
    } satisfies WorkflowReportComposerModel;
  },
);
