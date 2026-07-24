import type { ModelSelection } from "@t3tools/contracts";
import type { ModelSelection as WorkflowModelSelection } from "@t3team/sdk";

import { getChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";
import { fromWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";

/**
 * Resolve a workflow-engine child's model selection (`thread.turn` / `thread.create`) the same
 * way `t3team.thread.start_child` does: validate a cross-provider request against the live
 * provider snapshots rather than blindly mapping `p.model` (which previously accepted any
 * `provider`/`model` string with no check that the instance was configured or the model
 * existed on it).
 *
 * - No `requested` selection → inherit the run's base model unchanged.
 * - No catalog wired (some test/SDK harnesses don't set one) → fall back to the legacy blind
 *   `fromWorkflowModelSelection` mapping so existing SDK/test behavior is preserved.
 * - Catalog wired → fetch the live provider snapshots and defer to the same pure resolver
 *   `start_child` uses, throwing on an invalid provider/model so the caller's ask fails.
 */
export async function resolveWorkflowChildModel(
  base: ModelSelection,
  requested: WorkflowModelSelection | undefined,
): Promise<ModelSelection> {
  if (requested === undefined) return base;

  const catalog = getChildProviderCatalog();
  if (catalog === undefined) return fromWorkflowModelSelection(requested);

  const providers = await catalog();
  const result = resolveStartChildModelSelection({
    parentModelSelection: base,
    requestedProvider: requested.provider,
    requestedModel: requested.model.id,
    providers,
  });

  if (!result.ok) throw new Error(result.message);
  return result.value;
}
