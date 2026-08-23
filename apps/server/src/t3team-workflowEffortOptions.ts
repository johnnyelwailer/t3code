/**
 * Map a workflow's provider-agnostic `effort` ("light" | "standard" | "high") onto the current
 * provider's own reasoning control (PR review: "a generic way to define agent effort without
 * having to specify exact provider/model … to stay within the current provider").
 *
 * The author never names a provider or a model. The resolved `ModelSelection` keeps its instance
 * and model; only `options` is adjusted, using the option descriptors the instance advertises for
 * that model:
 *   • a SELECT control whose id/label reads as reasoning/effort/thinking (Codex's
 *     `reasoningEffort`) — its choices are ordered by the documented {@link EFFORT_LADDER} and the
 *     tier picks one: light → lowest, high → highest, standard → the provider's own default
 *     choice (or the middle one when it declares none);
 *   • else a BOOLEAN control that reads as thinking/reasoning (Claude's `thinking`) — high → on,
 *     light → off, standard → left at the provider default (nothing written);
 *   • else, when the provider's MODELS are themselves the tiers — slugs that are rungs of the
 *     documented {@link EFFORT_LADDER} (the Nexplore gateway's `low` / `medium` / `high` aliases,
 *     which expose no reasoning control at all) — the tier maps onto the closest rung: light →
 *     lowest, high → highest, standard → the provider's declared default rung (or the middle
 *     one). This is the one case where the model changes: there is no other control the tier
 *     could land on, and leaving the inherited model in place would silently run the tier the
 *     parent happened to sit on (e.g. `effort: "high"` on a Fast-tier parent).
 *   • else NO-OP. A provider without a reasoning control AND without tier models must not fail
 *     the ask, and we never silently swap the model out from under the author.
 */

import type {
  ModelSelection,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  ServerProvider,
  ServerProviderModel,
} from "@t3tools/contracts";
import { getProviderOptionDescriptors } from "@t3tools/shared/model";
import type { AgentEffort } from "@t3team/sdk";

/** Documented low→high ordering of the reasoning-choice vocabularies we know. Unknown ids keep
 * their declared order and rank after the known ones. */
export const EFFORT_LADDER = [
  "none",
  "minimal",
  "very-low",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const REASONING_ID = /reason|effort|think/i;

const rank = (id: string): number => {
  const at = EFFORT_LADDER.indexOf(id.toLowerCase() as (typeof EFFORT_LADDER)[number]);
  return at < 0 ? EFFORT_LADDER.length : at;
};

function reasoningDescriptor(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
): ProviderOptionDescriptor | undefined {
  const matches = descriptors.filter(
    (descriptor) => REASONING_ID.test(descriptor.id) || REASONING_ID.test(descriptor.label),
  );
  return matches.find((descriptor) => descriptor.type === "select") ?? matches[0];
}

/** The provider's models whose slugs are rungs of the documented {@link EFFORT_LADDER}, ordered
 * low→high. Providers that expose their thinking tiers as model aliases (the Nexplore gateway's
 * `low` / `medium` / `high` aliases) advertise no reasoning control — their model list IS the
 * control. A single coincidental rung (one model whose slug happens to read "high") is not a
 * ladder, so callers require at least two. */
const ladderRungs = (provider: ServerProvider): ReadonlyArray<ServerProviderModel> =>
  provider.models
    .filter((model) => rank(model.slug) < EFFORT_LADDER.length)
    .toSorted((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));

/** The rung a tier selects out of the provider's tier models, or `undefined` for a no-op. */
const ladderSlugFor = (
  rungs: ReadonlyArray<ServerProviderModel>,
  effort: AgentEffort,
  provider: ServerProvider,
): string | undefined => {
  if (effort === "light") return rungs[0]?.slug;
  if (effort === "high") return rungs[rungs.length - 1]?.slug;
  // standard → the provider's declared default when it is a rung, else the middle rung.
  const declaredDefault = provider.models.find((model) => model.isDefault)?.slug;
  if (declaredDefault && rungs.some((rung) => rung.slug === declaredDefault)) {
    return declaredDefault;
  }
  return rungs[Math.floor((rungs.length - 1) / 2)]?.slug;
};

/** The choice a tier selects out of a select control's options, or `undefined` for a no-op. */
function selectValue(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  effort: AgentEffort,
): string | undefined {
  const ordered = descriptor.options
    .map((option, index) => ({ option, index }))
    .toSorted((a, b) => rank(a.option.id) - rank(b.option.id) || a.index - b.index)
    .map((entry) => entry.option);
  if (ordered.length === 0) return undefined;
  if (effort === "light") return ordered[0]?.id;
  if (effort === "high") return ordered[ordered.length - 1]?.id;
  const declaredDefault =
    descriptor.options.find((option) => option.isDefault)?.id ?? descriptor.currentValue;
  return declaredDefault ?? ordered[Math.floor((ordered.length - 1) / 2)]?.id;
}

/** Replace (or append) one option selection, leaving every other selection untouched. */
function withSelection(
  selections: ReadonlyArray<ProviderOptionSelection>,
  next: ProviderOptionSelection,
): ReadonlyArray<ProviderOptionSelection> {
  const others = selections.filter((selection) => selection.id !== next.id);
  return [...others, next];
}

/**
 * Apply `effort` to `selection` using the live provider snapshots. Returns `selection` unchanged
 * whenever the tier cannot be expressed (no effort requested, instance not in the snapshot, no
 * reasoning control and no tier models, `standard` on a boolean control) — the documented no-op
 * degrade. The model only changes on the tier-model fallback above: the provider's own models are
 * the tiers, so the closest rung is the only place the tier can land.
 */
export function applyWorkflowEffort(
  selection: ModelSelection,
  effort: AgentEffort | undefined,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  if (effort === undefined) return selection;
  const provider = providers.find((candidate) => candidate.instanceId === selection.instanceId);
  if (!provider) return selection;
  const caps = provider.models.find((model) => model.slug === selection.model)?.capabilities;
  if (caps) {
    const descriptor = reasoningDescriptor(
      getProviderOptionDescriptors({ caps, selections: selection.options }),
    );
    if (descriptor !== undefined) {
      if (descriptor.type === "boolean") {
        if (effort === "standard") return selection;
        return {
          ...selection,
          options: withSelection(selection.options ?? [], {
            id: descriptor.id,
            value: effort === "high",
          }),
        };
      }
      const value = selectValue(descriptor, effort);
      if (value === undefined) return selection;
      return {
        ...selection,
        options: withSelection(selection.options ?? [], { id: descriptor.id, value }),
      };
    }
  }
  const rungs = ladderRungs(provider);
  if (rungs.length < 2) return selection;
  const slug = ladderSlugFor(rungs, effort, provider);
  if (slug === undefined || slug === selection.model) return selection;
  return { ...selection, model: slug };
}

/**
 * Whether a requested `effort` lands on something for `selection`'s provider: a reasoning
 * control on the selected model, or a ladder of at least two tier models. Callers use the
 * negative to say explicitly, in the launch result, that the tier was NOT honored — a silent
 * downgrade is the bug this exists to prevent.
 */
export function effortIsHonored(
  selection: ModelSelection,
  effort: AgentEffort | undefined,
  providers: ReadonlyArray<ServerProvider>,
): boolean {
  if (effort === undefined) return true;
  const provider = providers.find((candidate) => candidate.instanceId === selection.instanceId);
  if (!provider) return false;
  const caps = provider.models.find((model) => model.slug === selection.model)?.capabilities;
  if (
    caps &&
    reasoningDescriptor(getProviderOptionDescriptors({ caps, selections: selection.options })) !==
      undefined
  ) {
    return true;
  }
  return ladderRungs(provider).length >= 2;
}
