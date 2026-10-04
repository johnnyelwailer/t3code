/**
 * The exact provider/model-selection help topic (`t3team_help("model-selection")`), split out of
 * {@link ./t3team-workflowManual.ts} so each file carries one manual.
 *
 * Written for issue pj/nexi-distribution#339: forensics showed agents picking stale model slugs
 * because no tool lists live provider models, so the topic points authors at the live
 * `t3team_models` tool instead of any static catalog.
 */

export const T3TEAM_MODEL_SELECTION_MANUAL = `EXACT PROVIDER / MODEL SELECTION
Provider instance ids and model slugs are live runtime facts, not an SDK catalog. Before naming an
exact target, call t3team_models and use one returned instanceId + model slug verbatim. Never copy
ids from examples or guess from a provider family name. agent is already in scope.
Pass a plain string:

  await agent('Review this change', {
    label: 'Runtime-selected review',
    capabilities: 'inherit',
    model: '<instanceId returned by t3team_models>/<model slug returned for that instance>',
  })

The host validates this selection against the same live ProviderRegistry again when the child
starts. Use only the instanceId to choose its latest available model. Omit model to use the latest
available model on the current instance. Latest means the provider's non-legacy default, then its
first non-legacy model; a legacy model is a default only when every catalog entry is legacy.
An invalid instance or slug reports the valid choices verbatim. Prefer effort:
'light' | 'standard' | 'high' when the task needs a thinking tier rather than an exact model.`;
