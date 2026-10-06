/**
 * Fork thread facts: per-thread state that fork layers (workflows, child
 * status, activity labels, cross-environment binding, retention, resource
 * pressure) own and that the V2 thread shell does not carry.
 *
 * They travel on their own side stream (`t3team.subscribeThreadFacts`) instead
 * of the closed V2 shell schema: shells are produced on several paths (WS,
 * HTTP snapshot, MCP readers) and these facts change on fork writes, not on V2
 * domain events. Clients merge them over the shell by `threadId` and gate the
 * subscription on the environment capability `t3team.threadFacts`.
 *
 * `extensions` is the open slot for pack-owned facts: keys are pack-chosen
 * (namespace them, e.g. `"<pack>.<fact>"`), values are any JSON.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  OrchestrationWorkflowRunStatus,
  ThreadEnvironmentBinding,
} from "./t3team-orchestrationExt.ts";

/** `ephemeral` threads (repair/workflow helpers) are hidden from rosters once done. */
export const T3TeamThreadRetention = Schema.Literals(["ephemeral", "retained"]);
export type T3TeamThreadRetention = typeof T3TeamThreadRetention.Type;

export const T3TeamThreadFacts = Schema.Struct({
  threadId: ThreadId,
  /** Durable workflow-engine state of the run launched from this thread. */
  workflowRunStatus: Schema.optionalKey(Schema.NullOr(OrchestrationWorkflowRunStatus)),
  /** Soonest wake instant of a clock-parked workflow run launched from this thread. */
  sleepingUntil: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  /** Short generated label for what the thread is working on now; null when idle. */
  activityLabel: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  activityLabelUpdatedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  /** Background-only summary of meaningful child-thread work. Never enters chat context. */
  childStatus: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  childStatusUpdatedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  /** Execution environment the thread is bound to when it differs from this server's. */
  environment: Schema.optionalKey(Schema.NullOr(ThreadEnvironmentBinding)),
  retention: Schema.optionalKey(Schema.NullOr(T3TeamThreadRetention)),
  /** True while resource-pressure handling holds this thread's background work. */
  resourcePressurePaused: Schema.optionalKey(Schema.Boolean),
  /** Pack-owned facts, keyed by a pack-chosen namespaced name. */
  extensions: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  updatedAt: IsoDateTime,
});
export type T3TeamThreadFacts = typeof T3TeamThreadFacts.Type;

export const T3TeamSubscribeThreadFactsInput = Schema.Struct({
  /** Omit to follow every thread's facts. */
  threadId: Schema.optionalKey(ThreadId),
});
export type T3TeamSubscribeThreadFactsInput = typeof T3TeamSubscribeThreadFactsInput.Type;

/** First item is always a `snapshot`; later items are per-thread changes. */
export const T3TeamThreadFactsStreamEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("snapshot"), facts: Schema.Array(T3TeamThreadFacts) }),
  Schema.Struct({ type: Schema.Literal("upsert"), facts: T3TeamThreadFacts }),
  Schema.Struct({ type: Schema.Literal("removed"), threadId: ThreadId }),
]);
export type T3TeamThreadFactsStreamEvent = typeof T3TeamThreadFactsStreamEvent.Type;
