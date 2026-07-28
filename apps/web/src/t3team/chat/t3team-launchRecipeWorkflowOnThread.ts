/**
 * Launching a bundled recipe workflow on a thread that ALREADY exists.
 *
 * The counterpart to `runThreadBootstrapKickoff`'s workflow branch (which handles "there is no thread
 * yet"). Both end at `launchRecipeWorkflow`; neither ever starts an agent turn, because the workflow's
 * own first step is the deterministic `askUser`.
 *
 * `recipePath`/`workflowPath` must be present on the workflow — the launch route derives the run's
 * host-tool scope from the recipe manifest and FAILS CLOSED, so a launch without them produces a run
 * whose tool calls cannot resolve. `buildBundledSidecarRecipeWorkflowLaunch` is the only builder that
 * guarantees them, which is why nothing here assembles a launch by hand.
 */

import type { ModelSelection } from "@t3tools/contracts";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { toProjectRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import type { BundledRecipeWorkflow } from "~/t3team/t3team-sidecarRecipeLaunch";

export async function launchRecipeWorkflowOnThread(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly threadId: string;
  readonly workflow: BundledRecipeWorkflow;
  readonly kickoffMessage: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}): Promise<void> {
  await input.backend.launchRecipeWorkflow({
    threadId: input.threadId,
    kickoffMessage: input.kickoffMessage,
    titleSeed: input.workflow.title,
    createdAt: new Date().toISOString(),
    // Required by the launch route. The run's own writer turn uses it; the deterministic askUser that
    // runs first does not, which is what keeps the preselect itself free.
    modelSelection: {
      instanceId: String(input.modelSelection.instanceId),
      model: input.modelSelection.model,
    },
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    launch: toProjectRecipeWorkflowLaunch(input.workflow),
  });
}
