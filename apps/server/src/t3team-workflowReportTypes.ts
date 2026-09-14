/**
 * The auto-report's value shapes: what a run's report IS, and what it is composed FROM.
 *
 * Types only (the pattern of `t3team-workflowEphemeralLaunchTypes.ts`), importing nothing from the
 * composer so neither can take part in an import cycle, and so the LOC ceiling on the composer is
 * spent on behaviour rather than declarations.
 *
 * Vocabulary notes — everything here reuses a name that already exists:
 *   • `recipient` (`"agent" | "user"`) is the engine's OWN routing vocabulary, from
 *     `ThreadMessagePayload` in `t3team-workflowEngineBrokerTypes.ts`. Epic 25's routing table is
 *     written in the same two words, and stage 2 hands this straight to
 *     `t3team-workflowEngineBrokerNotify.ts` — so the report says WHO, in the words the transport
 *     already understands, rather than inventing an "assignee"/"owner"/"resolver" synonym.
 *   • the per-step facts are `ProjectRecipeWorkflowStepActivityPayload` verbatim — the same
 *     payload `t3team-workflowEngineStepActivities.ts` emits to the timeline. The reporter reads
 *     what the user can already see.
 *   • `WorkflowRunIntent` is the launch contract's own schema (migration 051 persists it).
 *
 * @module t3team-workflowReportTypes
 */
import type { ProjectRecipeWorkflowStepActivityPayload } from "@t3tools/project-recipes";
import type { WorkflowRunIntent } from "@t3team/sdk/tools/t3teamWorkflow";
import * as Schema from "effect/Schema";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";

/** Who has to resolve what the report found. The engine's existing routing vocabulary. */
export const WorkflowReportRecipient = Schema.Literals(["agent", "user"]);
export type WorkflowReportRecipient = typeof WorkflowReportRecipient.Type;

/**
 * The composer's structured output — a value, never a blob.
 *
 * Deliberately NOT length-capped anywhere: "reporter decides how long it must be.. as long as
 * necessary" (PJ, 2026-08-29). Brevity is the composer's editorial judgement, supervised by its
 * own instructions; a caller-imposed cap is the thing this design removes.
 */
export const WorkflowRunReport = Schema.Struct({
  /** The one line that may be the only line read: outcome + consequence, in plain words. */
  verdict: Schema.String,
  /** The report itself, as markdown. Length is the composer's call. */
  body: Schema.String,
  /** Who should resolve this, and why — stage 2 routes on it. */
  recipient: WorkflowReportRecipient,
  recipientReason: Schema.String,
});
export type WorkflowRunReport = typeof WorkflowRunReport.Type;

/**
 * A composed report plus its provenance. `origin` says whether a model wrote it or the structural
 * fallback did, so a caller can tell a judgement apart from a rendering, and `fallbackReason`
 * records WHY the composer was bypassed (it is the only trace of a composer failure — the failure
 * itself is swallowed on purpose).
 */
export const WorkflowRunReportRecord = Schema.Struct({
  report: WorkflowRunReport,
  origin: Schema.Literals(["composed", "fallback"]),
  fallbackReason: Schema.optional(Schema.String),
  composedAt: Schema.String,
});
export type WorkflowRunReportRecord = typeof WorkflowRunReportRecord.Type;

/** One child thread's transcript, already loaded by the caller. */
export interface WorkflowReportTranscript {
  readonly threadId: string;
  /** Human label for the step that owned this thread, when the caller knows one. */
  readonly label?: string | undefined;
  readonly text: string;
}

/**
 * Everything the composer judges from. A plain value, not a set of services: the seam takes
 * FACTS so it stays testable from a fixture, and so stage 2 owns the (projection-shaped) work of
 * gathering them.
 */
export interface WorkflowRunReportFacts {
  readonly runId: string;
  /** Terminal status as the durable row records it. */
  readonly status: WorkflowRun["status"];
  /** The run's own returned value, if it completed with one — rendered structurally in the
   * fallback, and given to the composer as the run's stated outcome. */
  readonly output?: unknown;
  readonly failureReason?: string | null | undefined;
  readonly failureStep?: string | null | undefined;
  /** What the run was asked to do (migration 051). Absent for a pre-051 or intentless run — the
   * composer is then told outcome cannot be judged, rather than guessing one. */
  readonly intent?: WorkflowRunIntent | null | undefined;
  /** The run's step timeline, in emission order. */
  readonly steps: ReadonlyArray<ProjectRecipeWorkflowStepActivityPayload>;
  /** Child-thread transcripts. The composer summarises across them; it never forwards one. */
  readonly transcripts?: ReadonlyArray<WorkflowReportTranscript> | undefined;
}
