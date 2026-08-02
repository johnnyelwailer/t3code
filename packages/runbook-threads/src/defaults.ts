/**
 * A thread's per-call defaults and the merge that applies them to one ask.
 *
 * A thread's `model` / `models` / `effort` are defaults, not overrides: an ask that names its own
 * wins. `capabilities` is deliberately NOT here — those are fixed when the thread is created and an
 * ask cannot restate them.
 */

import type { AgentEffort, AskOpts, ModelCascade } from "./types.ts";
import type { ModelSelection } from "./models.ts";

/** A thread's per-call defaults, applied to every ask that omits them. */
export interface ThreadDefaults {
  readonly model: ModelSelection | undefined;
  readonly models: ModelCascade | undefined;
  readonly effort: AgentEffort | undefined;
}

export function withThreadDefaults<R>(
  o: AskOpts<R> | undefined,
  defaults: ThreadDefaults,
): AskOpts<R> {
  const model = o?.model ?? defaults.model;
  const models = o?.models ?? defaults.models;
  const effort = o?.effort ?? defaults.effort;
  return {
    ...o,
    ...(model === undefined ? {} : { model }),
    ...(models === undefined ? {} : { models }),
    ...(effort === undefined ? {} : { effort }),
  };
}
