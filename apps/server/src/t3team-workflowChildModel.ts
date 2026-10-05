import type { ModelSelection } from "@t3tools/contracts";
import type { AgentEffort, ModelCascadeWireEntry, ModelOption } from "@t3team/sdk";

import { getChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";
import {
  resolveModelCascade,
  type WorkflowModelCascadeChoice,
} from "./t3team-workflowModelCascade.ts";
import {
  fromWorkflowModelSelection,
  parseWorkflowModelOption,
} from "./t3team-workflowModelSelection.ts";

/**
 * Resolve a workflow-engine child's model selection (`thread.turn` / `thread.create`) the same
 * way `t3team.thread.start_child` does: validate a cross-provider request against the live
 * provider snapshots rather than blindly mapping `p.model` (which previously accepted any
 * `provider`/`model` string with no check that the instance was configured or the model
 * existed on it).
 *
 * `effort` rides along: a provider-agnostic thinking level applied to whichever selection wins,
 * via {@link applyWorkflowEffort} (a no-op when the provider exposes neither a reasoning control
 * nor tier models).
 *
 * - No requested model → select the base instance's live catalog default, avoiding legacy models.
 * - No catalog wired (some test/SDK harnesses don't set one) → fall back to the legacy blind
 *   `fromWorkflowModelSelection` mapping so existing SDK/test behavior is preserved.
 * - Catalog wired → fetch the live provider snapshots and defer to the same pure resolver
 *   `start_child` uses, throwing on an invalid provider/model so the caller's ask fails.
 */
export async function resolveWorkflowChildModel(
  base: ModelSelection,
  requested: ModelOption | undefined,
  effort?: AgentEffort,
  /** Host-injected defaults choose the latest model on their policy's instance. */
  requestedIsDefault = false,
): Promise<ModelSelection> {
  const catalog = getChildProviderCatalog();
  // No catalog (some test/SDK harnesses): legacy blind mapping, and `effort` degrades to a no-op
  // because the provider's option descriptors are only knowable from a live snapshot.
  if (catalog === undefined) {
    return requested === undefined ? base : fromWorkflowModelSelection(requested);
  }

  const providers = await catalog();
  const parsed = requested === undefined ? undefined : parseWorkflowModelOption(requested);
  const result = resolveStartChildModelSelection({
    parentModelSelection: base,
    requestedProvider: parsed?.provider,
    requestedModel: requestedIsDefault ? undefined : parsed?.model,
    effort,
    providers,
  });

  if (!result.ok) throw result.error;
  return result.value;
}

/**
 * Resolve a `model.resolve` primitive's provider ladder against the live snapshots. The winning
 * selection is the primitive's journaled reply, so a replay reuses it instead of re-probing.
 *
 * No catalog wired (SDK fs path / minimal tests) → no choice, and the ask keeps the run's default
 * selection: availability is only knowable from a live snapshot, and guessing a provider is worse
 * than staying on the model the run was launched with.
 */
export async function resolveWorkflowModelCascade(
  base: ModelSelection,
  entries: ReadonlyArray<ModelCascadeWireEntry>,
): Promise<WorkflowModelCascadeChoice> {
  const catalog = getChildProviderCatalog();
  if (catalog === undefined) {
    return {
      selection: undefined,
      reason: `no provider registry wired; keeping the run's default ${base.instanceId}/${base.model}`,
    };
  }
  return resolveModelCascade({ base, entries, providers: await catalog() });
}
