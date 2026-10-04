import { ProviderInstanceId, type ModelSelection, type ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { AgentEffort } from "@t3team/sdk";

import {
  buildStartChildModelSelection,
  type T3TeamStartChildArgs,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildArgs.ts";
import { applyWorkflowEffort, effortIsHonored } from "./t3team-workflowEffortOptions.ts";
import {
  formatList,
  optionsSupportedByModel,
  resolveSlug,
  slugPrefixHint,
  unusableReason,
  WorkflowModelSelectionError,
} from "./t3team-toolBrokerStartChildProviderSlug.ts";

/**
 * Free cross-provider + model resolution for `t3team.thread.start_child`.
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

/**
 * Effectful wrapper used by the start_child flow: loads the live provider
 * snapshots (empty when the registry is absent), runs the pure resolver, and
 * fails the turn with the resolver's message when the requested provider/model
 * is invalid. Keeps `t3team-toolBrokerStartChild.ts` a single call site.
 *
 * Also surfaces an `effortNote` when a provider-agnostic `effort` was requested
 * but CANNOT be honored (the provider exposes neither a reasoning control nor
 * tier models): the downgrade then says so in the launch result instead of
 * silently running the child on whatever model it inherited.
 */
export type ResolveChildModelResult = {
  readonly modelSelection: ModelSelection;
  readonly effortNote?: string;
};

export function resolveChildModel(
  baseModelSelection: ModelSelection,
  args: Pick<T3TeamStartChildArgs, "provider" | "model" | "reasoningEffort" | "effort">,
  listProviders: (() => Effect.Effect<ReadonlyArray<ServerProvider>>) | undefined,
): Effect.Effect<ResolveChildModelResult, string> {
  return Effect.gen(function* () {
    if (args.provider && !listProviders) {
      return yield* Effect.fail(
        `Provider registry is not wired into this server build; cannot resolve provider ` +
          `instance '${args.provider}' for start_child.`,
      );
    }
    if (!listProviders) {
      return {
        modelSelection: buildStartChildModelSelection(baseModelSelection, args),
        ...(args.effort
          ? {
              effortNote: `effort '${args.effort}' was not honored: no provider registry is wired.`,
            }
          : {}),
      };
    }
    const providers = listProviders ? yield* listProviders() : [];
    const result = resolveStartChildModelSelection({
      parentModelSelection: baseModelSelection,
      ...(args.provider ? { requestedProvider: args.provider } : {}),
      ...(args.model ? { requestedModel: args.model } : {}),
      ...(args.reasoningEffort ? { reasoningEffort: args.reasoningEffort } : {}),
      ...(args.effort ? { effort: args.effort } : {}),
      providers,
    });
    if (!result.ok) return yield* Effect.fail(result.message);
    const effortNote =
      args.effort !== undefined && !effortIsHonored(result.value, args.effort, providers)
        ? `effort '${args.effort}' was not honored: provider '${result.value.instanceId}' exposes ` +
          `no reasoning control and no tier models; the child runs on model '${result.value.model}'.`
        : undefined;
    return {
      modelSelection: result.value,
      ...(effortNote ? { effortNote } : {}),
    };
  });
}
