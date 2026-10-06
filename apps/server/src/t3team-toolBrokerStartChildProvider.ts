import { ProviderInstanceId, type ModelSelection, type ServerProvider } from "@t3tools/contracts";

import type { AgentEffort } from "@t3team/sdk";

import {
  buildStartChildModelSelection,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildModel.ts";
import { applyWorkflowEffort } from "./t3team-workflowEffortOptions.ts";
import {
  formatList,
  optionsSupportedByModel,
  resolveSlug,
  slugPrefixHint,
  unusableReason,
  WorkflowModelSelectionError,
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
  | {
      readonly ok: false;
      readonly message: string;
      readonly error: WorkflowModelSelectionError;
    };

/**
 * Resolve the child's `ModelSelection`.
 *
 * The instance defaults to the parent's instance. The model is that instance's
 * declared non-legacy default. With no declared default, the same instance keeps
 * the parent's model; any other instance fails with its valid slugs.
 * Explicit models use exact catalog matching, including explicitly chosen legacy models.
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
  const requested = input.requestedProvider?.trim() ?? input.parentModelSelection.instanceId;
  const target = input.providers.find(
    (provider) => provider.instanceId.toLowerCase() === requested.toLowerCase(),
  );
  if (!target) {
    const choices = input.providers.map((provider) => provider.instanceId);
    const hint = slugPrefixHint(requested, input.requestedModel, input.providers);
    const error = new WorkflowModelSelectionError(
      "unknown_instance",
      `Unknown provider instance '${requested}'. Available provider instances: ` +
        `${formatList(choices)}. Use model: "<instanceId>" or "<instanceId>/<slug>" ` +
        `with one of these exact instance ids.${hint}`,
      choices,
    );
    return { ok: false, message: error.message, error };
  }

  const reason = unusableReason(target);
  if (reason) {
    const error = new WorkflowModelSelectionError(
      "unavailable_instance",
      `Provider instance '${target.instanceId}' cannot run a child: ${reason}.`,
    );
    return { ok: false, message: error.message, error };
  }

  const slug = resolveSlug(target, input.requestedModel, input.parentModelSelection);
  if (!slug.ok) return slug;

  const sameInstance =
    target.instanceId.toLowerCase() === input.parentModelSelection.instanceId.toLowerCase();
  const base: ModelSelection = {
    instanceId: ProviderInstanceId.make(target.instanceId),
    model: slug.slug,
    options: sameInstance
      ? optionsSupportedByModel(target, slug.slug, input.parentModelSelection.options)
      : [],
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
