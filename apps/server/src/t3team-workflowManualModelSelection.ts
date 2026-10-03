/**
 * The exact provider/model-selection help topic (`t3team_help("model-selection")`), split out of
 * {@link ./t3team-workflowManual.ts} so each file carries one manual.
 *
 * Agents picked stale model slugs when nothing listed the live provider models, so the topic
 * points authors at upstream's live `orchestrator_capabilities` tool instead of any static
 * catalog.
 */

export const T3TEAM_MODEL_SELECTION_MANUAL = `EXACT PROVIDER / MODEL SELECTION
Provider instance ids and model slugs are live runtime facts, not an SDK catalog. Before naming an
exact target, call orchestrator_capabilities and use one returned providers[].providerInstanceId
+ providers[].models[].id verbatim. Never copy
ids from examples or guess from a provider family name. Then construct the typed value generically:

  import { agent, defineModel } from "@t3team/sdk"

  const selected = {
    provider: '<providerInstanceId returned by orchestrator_capabilities>',
    model: defineModel({
      provider: '<same runtime instanceId>',
      id: '<models[].id returned for that instance>',
    }),
  }

  await agent('Review this change', {
    label: 'Runtime-selected review',
    capabilities: 'inherit',
    model: selected,
  })

The host validates this selection against the same live ProviderRegistry again when the child
starts. Omit model to inherit the inheritedProviderInstanceId + inheritedModel reported by
orchestrator_capabilities. Prefer effort:
'light' | 'standard' | 'high' when the task needs a thinking tier rather than an exact model.`;
