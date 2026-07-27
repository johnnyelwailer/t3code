/**
 * Host half of the workflow model cascade (`agent(prompt, { models: [...] })`): walk the author's
 * provider ladder against the LIVE provider snapshots and return the first rung that can actually
 * run a turn.
 *
 * There is deliberately no second availability check here. Each rung is handed to
 * {@link resolveStartChildModelSelection} — the same resolver `t3team.thread.start_child` uses for
 * free cross-provider spawning — so "available" means exactly what it means for start_child: the
 * instance exists, its driver is available, it is installed and enabled, and it owns the requested
 * model (or has one to fall back on). A rung that fails becomes a skip reason, not an error.
 *
 * A rung with no `instanceId` means "this model on the run's CURRENT provider instance", so the
 * base instance is substituted and the same validation applies — a model the current provider does
 * not own falls through like any other unavailable rung.
 *
 * No rung available → no selection. The caller keeps the run's current/default selection: a
 * cascade is a preference ladder, not a precondition, and must never fail the step on its own.
 */

import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import type { ModelCascadeWireEntry } from "@t3team/sdk";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";

/** What the broker journals as the `model.resolve` reply: the winner (if any) plus why. */
export interface WorkflowModelCascadeChoice {
  readonly selection: ModelSelection | undefined;
  /** Human-readable: which rung won, or why none did, plus every rung that was skipped. */
  readonly reason: string;
}

const describeEntry = (entry: ModelCascadeWireEntry, base: ModelSelection): string =>
  `${entry.instanceId ?? base.instanceId}${entry.model === undefined ? "" : `/${entry.model}`}`;

export function resolveModelCascade(input: {
  readonly base: ModelSelection;
  readonly entries: ReadonlyArray<ModelCascadeWireEntry>;
  readonly providers: ReadonlyArray<ServerProvider>;
}): WorkflowModelCascadeChoice {
  const skipped: string[] = [];
  for (const [index, entry] of input.entries.entries()) {
    const label = `#${index + 1} (${describeEntry(entry, input.base)})`;
    const result = resolveStartChildModelSelection({
      parentModelSelection: input.base,
      requestedProvider: entry.instanceId ?? input.base.instanceId,
      ...(entry.model === undefined ? {} : { requestedModel: entry.model }),
      providers: input.providers,
    });
    if (result.ok) {
      const chose = `chose ${label} → ${result.value.instanceId}/${result.value.model}`;
      return {
        selection: result.value,
        reason: skipped.length === 0 ? chose : `${chose}; skipped ${skipped.join("; ")}`,
      };
    }
    skipped.push(`${label}: ${result.message}`);
  }
  const fallback = `keeping the run's default ${input.base.instanceId}/${input.base.model}`;
  return {
    selection: undefined,
    reason:
      input.entries.length === 0
        ? `empty cascade; ${fallback}`
        : `no cascade entry is available; ${fallback}. Skipped ${skipped.join("; ")}`,
  };
}
