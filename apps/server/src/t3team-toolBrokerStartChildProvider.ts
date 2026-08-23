import {
  isProviderAvailable,
  ProviderInstanceId,
  type ModelSelection,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { AgentEffort } from "@t3team/sdk";

import {
  buildStartChildModelSelection,
  type T3TeamStartChildArgs,
  type T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildArgs.ts";
import { applyWorkflowEffort, effortIsHonored } from "./t3team-workflowEffortOptions.ts";

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

const MAX_LISTED = 12;

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

const formatList = (values: ReadonlyArray<string>): string => {
  if (values.length === 0) return "none";
  const shown = values.slice(0, MAX_LISTED).map((value) => `'${value}'`);
  const extra = values.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} (+${extra} more)` : shown.join(", ");
};

const unusableReason = (provider: ServerProvider): string | undefined => {
  if (!isProviderAvailable(provider)) {
    return provider.unavailableReason ?? "the provider driver is unavailable in this build";
  }
  if (!provider.installed) return "the provider is not installed";
  if (!provider.enabled) return "the provider is disabled";
  return undefined;
};

type SlugResult =
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly message: string };

const resolveSlug = (
  provider: ServerProvider,
  requestedModel: string | undefined,
  parentModel: string,
): SlugResult => {
  if (requestedModel) {
    const wanted = requestedModel.trim().toLowerCase();
    const match = provider.models.find((model) => model.slug.toLowerCase() === wanted);
    if (!match) {
      return {
        ok: false,
        message:
          `Model '${requestedModel}' is not available on provider instance ` +
          `'${provider.instanceId}'. Valid models: ${formatList(provider.models.map((m) => m.slug))}.`,
      };
    }
    return { ok: true, slug: match.slug };
  }

  const parentSlug = parentModel.trim().toLowerCase();
  const chosen =
    provider.models.find((model) => model.slug.toLowerCase() === parentSlug) ?? provider.models[0];
  if (!chosen) {
    return {
      ok: false,
      message: `Provider instance '${provider.instanceId}' has no models configured to run a child on.`,
    };
  }
  return { ok: true, slug: chosen.slug };
};

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
