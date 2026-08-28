/**
 * The token-usage hook — the journaled `usage` primitive.
 *
 * Hosts record agent-step token usage into the run's journal as it happens (the host broker
 * knows the provider's counts; the core does not). Because the record is journaled, a resumed
 * run replays the recorded usage instead of re-counting, and {@link import("./status.ts").inspectRun}
 * aggregates the totals for any run — live or finished.
 */

import type { PrimitiveCall } from "./runtimeTypes.ts";

/** One usage observation (typically one agent step). */
export interface UsageInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Provider/model label, when the host has one. */
  readonly model?: string;
  /** Human label of the step that produced the usage (e.g. the agent prompt snippet). */
  readonly step?: string;
}

/** The durable usage record; stable across replay. */
export interface UsageRecord extends UsageInput {
  /** Host-formatted recording timestamp. */
  readonly at: string;
}

/** Aggregated usage for a run. */
export interface UsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly records: number;
}

export interface UsageRecorderDeps {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly nowIso: () => string;
}

/** Record one usage observation into the run journal. */
export function createUsageRecorder(deps: UsageRecorderDeps): (usage: UsageInput) => Promise<void> {
  return (usage: UsageInput): Promise<void> =>
    deps
      .callPrimitive<UsageRecord>({
        kind: "usage",
        refId: "usage",
        args: usage,
        exec: async () => ({ ...usage, at: deps.nowIso() }),
      })
      .then(() => undefined);
}

/** Sum a run's journaled usage records. */
export function summarizeUsage(records: readonly UsageRecord[]): UsageTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const record of records) {
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
  }
  return { inputTokens, outputTokens, records: records.length };
}
