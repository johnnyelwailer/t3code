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
 *   • else NO-OP. A provider without a reasoning control must not fail the ask, and we never
 *     silently swap the model out from under the author.
 */

import type {
  ModelSelection,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  ServerProvider,
} from "@t3tools/contracts";
import { getProviderOptionDescriptors } from "@t3tools/shared/model";
import type { AgentEffort } from "@t3work/sdk";

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
 * whenever the tier cannot be expressed (no effort requested, instance/model not in the snapshot,
 * no reasoning control, `standard` on a boolean control) — the documented no-op degrade.
 */
export function applyWorkflowEffort(
  selection: ModelSelection,
  effort: AgentEffort | undefined,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  if (effort === undefined) return selection;
  const provider = providers.find((candidate) => candidate.instanceId === selection.instanceId);
  const caps = provider?.models.find((model) => model.slug === selection.model)?.capabilities;
  if (!caps) return selection;
  const descriptor = reasoningDescriptor(
    getProviderOptionDescriptors({ caps, selections: selection.options }),
  );
  if (descriptor === undefined) return selection;
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
