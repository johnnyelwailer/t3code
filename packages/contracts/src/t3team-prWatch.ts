/**
 * Read side of the PR-watch facts the UI consumes (hive design packet, docs 03/06/07). The
 * host-written facts (`t3team.recipe`, `t3team.launchedBy`) and the generic recipe summary are
 * `t3team-recipeFacts.ts`; this module adds the one pack-owned fact the pass writes on each
 * watch thread, and lenient readers: a missing or malformed value reads as "no fact", never as
 * a crash in a sidebar row.
 */
import * as Schema from "effect/Schema";

import {
  T3TEAM_LAUNCHED_BY_FACT_KEY,
  T3TEAM_RECIPE_FACT_KEY,
  T3TeamLaunchedByFact,
  T3TeamRecipeLaunchFact,
  T3TeamRecipeSummaryFact,
} from "./t3team-recipeFacts.ts";

/** The pr-watch recipe's summary (`T3TeamRecipeSummaryFact`) on its launch thread. */
export const NEXPLORE_PR_WATCH_SUMMARY_FACT_KEY = "nexplore.pr-watch.summary";
/** The pr-watch recipe's chips on each watch thread. */
export const NEXPLORE_PR_WATCH_THREAD_FACT_KEY = "nexplore.pr-watch.thread";

/** Count ids the pr-watch pass writes into its `T3TeamRecipeSummaryFact.counts`. The card derives
 * `needs-you` and `fixing` live from the run's threads and reads the others from the summary. */
export const PR_WATCH_COUNT_ID = {
  watched: "watched",
  needsYou: "needs-you",
  fixing: "fixing",
  parked: "parked",
  unreadable: "unreadable",
} as const;

/** Warning kinds the pr-watch pass writes. A `sign-in` warning names its host in `key`. */
export const PR_WATCH_WARNING_KIND = {
  fallback: "fallback",
  config: "config",
  signIn: "sign-in",
} as const;

export const PrWatchOwnershipVerdict = Schema.Literals(["own", "stake", "foreign", "unsure"]);
export type PrWatchOwnershipVerdict = typeof PrWatchOwnershipVerdict.Type;

/** `extensions["nexplore.pr-watch.thread"]`, written by the pass (doc 02 §2 step 8). */
export const PrWatchThreadFact = Schema.Struct({
  ownership: Schema.optional(
    Schema.Struct({
      verdict: PrWatchOwnershipVerdict,
      source: Schema.optional(Schema.String),
      evidence: Schema.optional(Schema.String),
    }),
  ),
  merge: Schema.optional(
    Schema.Struct({
      mode: Schema.Literals(["manual", "auto"]),
      source: Schema.optional(Schema.String),
    }),
  ),
  parked: Schema.optional(Schema.Struct({ reason: Schema.String })),
  /** Display label of the model the watch thread fixes on. */
  model: Schema.optional(Schema.String),
  /** The pass's one-line question or note for the viewer, under the count-hover row. */
  note: Schema.optional(Schema.String),
  lastWake: Schema.optional(
    Schema.Struct({ text: Schema.String, at: Schema.optional(Schema.String) }),
  ),
});
export type PrWatchThreadFact = typeof PrWatchThreadFact.Type;

type Extensions = Readonly<Record<string, unknown>> | undefined;
type Decoder<A> = (value: unknown) => { _tag: "Some"; value: A } | { _tag: "None" };

function readExtension<A>(extensions: Extensions, key: string, decode: Decoder<A>): A | null {
  const raw = extensions?.[key];
  if (raw === undefined || raw === null) return null;
  const decoded = decode(raw);
  return decoded._tag === "Some" ? decoded.value : null;
}

const decodeRecipeLaunchFact = Schema.decodeUnknownOption(T3TeamRecipeLaunchFact);
const decodeLaunchedByFact = Schema.decodeUnknownOption(T3TeamLaunchedByFact);
const decodeSummaryFact = Schema.decodeUnknownOption(T3TeamRecipeSummaryFact);
const decodeThreadFact = Schema.decodeUnknownOption(PrWatchThreadFact);

export function readT3TeamRecipeLaunchFact(
  extensions: Extensions,
): typeof T3TeamRecipeLaunchFact.Type | null {
  return readExtension(extensions, T3TEAM_RECIPE_FACT_KEY, decodeRecipeLaunchFact);
}

export function readT3TeamLaunchedByFact(
  extensions: Extensions,
): typeof T3TeamLaunchedByFact.Type | null {
  return readExtension(extensions, T3TEAM_LAUNCHED_BY_FACT_KEY, decodeLaunchedByFact);
}

/** The recipe-chosen summary key defaults to pr-watch's; another recipe passes its own. */
export function readT3TeamRecipeSummaryFact(
  extensions: Extensions,
  key: string = NEXPLORE_PR_WATCH_SUMMARY_FACT_KEY,
): typeof T3TeamRecipeSummaryFact.Type | null {
  return readExtension(extensions, key, decodeSummaryFact);
}

export function readPrWatchThreadFact(extensions: Extensions): PrWatchThreadFact | null {
  return readExtension(extensions, NEXPLORE_PR_WATCH_THREAD_FACT_KEY, decodeThreadFact);
}

/** `t3team.launchedBy.scope` is `recipe:<id>` for a thread a recipe's run launched. */
export function recipeIdOfLaunchScope(scope: string | undefined): string | null {
  return scope !== undefined && scope.startsWith("recipe:") ? scope.slice("recipe:".length) : null;
}
