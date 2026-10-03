import { ProviderInstanceId, type ModelSelection, type ServerProvider } from "@t3tools/contracts";

import type { AgentEffort } from "@t3team/sdk";

import {
  buildStartChildModelSelection,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildModel.ts";
import { applyWorkflowEffort } from "./t3team-workflowEffortOptions.ts";
import {
  formatList,
  resolveSlug,
  unusableReason,
} from "./t3team-toolBrokerStartChildProviderSlug.ts";

/**
 * Free cross-provider + model resolution for fork child turns (workflow children; the
 * delegate_task path resolves its target upstream and only applies `effort` on top).
 *
 * This is a GENERIC host capability: it lets a parent agent spawn a child on a
 * DIFFERENT configured provider instance (e.g. a Claude parent spawning a Codex
 * child for cross-provider review) through the same code path for every
 * provider — there is no provider-name special-casing here.
 *
 * `buildStartChildModelSelection` stays the single source of reasoning-effort
 * handling; this module only picks the routing instance + model slug and then
 * defers to it so effort logic is never duplicated.
 */

export type ResolveStartChildModelSelectionInput = {
  readonly parentModelSelection: ModelSelection;
  readonly requestedProvider?: string | undefined;
  readonly requestedModel?: string | undefined;
  readonly reasoningEffort?: T3TeamStartChildReasoningEffort | undefined;
  /** Provider-agnostic thinking tier; mapped by the SHARED {@link applyWorkflowEffort} seam
   * (same one workflow child turns use). Ignored when `reasoningEffort` is also set. */
  readonly effort?: AgentEffort | undefined;
  readonly providers: ReadonlyArray<ServerProvider>;
};

export type ResolveStartChildModelSelectionResult =
  | { readonly ok: true; readonly value: ModelSelection }
  | { readonly ok: false; readonly message: string };

/**
 * Resolve the child's `ModelSelection`.
 *
 * - No `requestedProvider` → inherit the parent's provider instance and defer
 *   entirely to `buildStartChildModelSelection` (pure refactor, no behavior
 *   change).
 * - `requestedProvider` set → validate it against the live provider snapshots
 *   (must exist, be usable, and own the requested/default model), then build a
 *   cross-provider base and reuse `buildStartChildModelSelection` for effort.
 */
export function resolveStartChildModelSelection(
  input: ResolveStartChildModelSelectionInput,
): ResolveStartChildModelSelectionResult {
  // The provider-agnostic tier goes through the SAME seam workflow child turns use, and only
  // when no explicit provider-vocabulary `reasoningEffort` was requested (that one is more
  // specific, and both write the same option, so applying both would be a silent override).
  const withTier = (selection: ModelSelection): ModelSelection =>
    input.reasoningEffort
      ? selection
      : applyWorkflowEffort(selection, input.effort, input.providers);
  const requested = input.requestedProvider?.trim();
  if (!requested) {
    const target = input.providers.find(
      (provider) => provider.instanceId === input.parentModelSelection.instanceId,
    );
    return {
      ok: true,
      value: withTier(
        buildStartChildModelSelection(
          input.parentModelSelection,
          {
            ...(input.requestedModel ? { model: input.requestedModel } : {}),
            ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
          },
          target,
        ),
      ),
    };
  }

  const target = input.providers.find((provider) => provider.instanceId === requested);
  if (!target) {
    return {
      ok: false,
      message:
        `Unknown provider instance '${requested}'. Available provider instances: ` +
        `${formatList(input.providers.map((provider) => provider.instanceId))}.`,
    };
  }

  const reason = unusableReason(target);
  if (reason) {
    return {
      ok: false,
      message: `Provider instance '${requested}' cannot run a child: ${reason}.`,
    };
  }

  const slug = resolveSlug(target, input.requestedModel, input.parentModelSelection.model);
  if (!slug.ok) return slug;

  const base: ModelSelection = {
    instanceId: ProviderInstanceId.make(requested),
    model: slug.slug,
    options: [],
  };
  return {
    ok: true,
    value: withTier(
      buildStartChildModelSelection(
        base,
        input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {},
        target,
      ),
    ),
  };
}
