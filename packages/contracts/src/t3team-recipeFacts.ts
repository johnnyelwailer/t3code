/**
 * Well-known `extensions` facts the host itself writes for recipe runs, and the shape a recipe's
 * own summary fact takes, so a client can type what it reads. All of them ride the thread facts
 * stream (`t3team-threadFacts.ts`); none is a new stream.
 *
 *  - `t3team.recipe` on a recipe run's launch thread: which recipe this thread runs, so a card
 *    finds "the recipe's run in this project" by recipe id.
 *  - `t3team.launchedBy` on a thread a workflow launched (`launchThread`): the run, home thread
 *    and key that launched it, so a client can list a run's threads and their live state.
 *  - A recipe summary (`T3TeamRecipeSummaryFact`) under a key the recipe chooses, written by the
 *    recipe with `setRunFacts` on its launch thread.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TEAM_RECIPE_FACT_KEY = "t3team.recipe";
export const T3TEAM_LAUNCHED_BY_FACT_KEY = "t3team.launchedBy";

/** `extensions["t3team.recipe"]`, set by the host when a recipe's workflow launches on a thread. */
export const T3TeamRecipeLaunchFact = Schema.Struct({
  id: TrimmedNonEmptyString,
  /** The recipe's declared version; null where it declares none. */
  version: Schema.NullOr(TrimmedNonEmptyString),
  /** The workflow run the launch started. */
  runId: TrimmedNonEmptyString,
  /** The recipe action the run launched (`default` when the recipe has one entry). */
  action: Schema.NullOr(TrimmedNonEmptyString),
  launchedAt: IsoDateTime,
});
export type T3TeamRecipeLaunchFact = typeof T3TeamRecipeLaunchFact.Type;

/** `extensions["t3team.launchedBy"]`, set by the host on every thread a workflow launched. */
export const T3TeamLaunchedByFact = Schema.Struct({
  /** The run that last launched or adopted this thread. */
  runId: TrimmedNonEmptyString,
  /** That run's launch (home) thread; null for a headless run. */
  launchThreadId: Schema.NullOr(ThreadId),
  /** Who may address the thread by key: `recipe:<id>` for a recipe run, else `run:<runId>`. */
  scope: TrimmedNonEmptyString,
  /** The author's key, unique within the scope and project (`pr:<host>/<repo>#<n>`). */
  key: TrimmedNonEmptyString,
  launchedAt: IsoDateTime,
});
export type T3TeamLaunchedByFact = typeof T3TeamLaunchedByFact.Type;

/** How a summary count reads; clients map it to their status colours. */
export const T3TeamRecipeSummaryTone = Schema.Literals([
  "neutral",
  "working",
  "attention",
  "warning",
  "error",
]);
export type T3TeamRecipeSummaryTone = typeof T3TeamRecipeSummaryTone.Type;

/**
 * A long-running recipe's one-line status for its card: counts in display order and warnings.
 * Written by the recipe (`setRunFacts`) only when it changed. Counts a client can derive live
 * from thread shells (questions, active turns) should be derived there; the summary carries
 * what only the recipe knows.
 */
export const T3TeamRecipeSummaryFact = Schema.Struct({
  counts: Schema.Array(
    Schema.Struct({
      /** Stable id (`watched`, `parked`), for links and tests. */
      id: TrimmedNonEmptyString,
      label: TrimmedNonEmptyString,
      value: NonNegativeInt,
      tone: Schema.optionalKey(T3TeamRecipeSummaryTone),
    }),
  ),
  /** Free one-liner after the counts (`Conductor · this Mac`). */
  detail: Schema.optionalKey(TrimmedNonEmptyString),
  warnings: Schema.Array(
    Schema.Struct({
      kind: TrimmedNonEmptyString,
      text: TrimmedNonEmptyString,
      /** The config key the warning is about, when it is one. */
      key: Schema.optionalKey(TrimmedNonEmptyString),
      file: Schema.optionalKey(TrimmedNonEmptyString),
      line: Schema.optionalKey(NonNegativeInt),
    }),
  ),
  updatedAt: IsoDateTime,
});
export type T3TeamRecipeSummaryFact = typeof T3TeamRecipeSummaryFact.Type;
