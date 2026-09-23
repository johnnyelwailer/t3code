import * as Effect from "effect/Effect";

import { type ThreadAskFn, T3TEAM_ASK_SYSTEM_PROMPT } from "./t3team-threadAskModel.ts";
import {
  estimateAskTokens,
  selectThreadAskSpan,
  T3TEAM_ASK_DEFAULT_SPAN_TOKENS,
  T3TEAM_ASK_MAX_SPAN_TOKENS,
  type ThreadAskSpanMatch,
} from "./t3team-threadAskSpan.ts";
import type { ThreadSearchEntry } from "./t3team-threadMessageSearch.ts";

/**
 * Question mode for `t3team.thread.search`: pick a bounded span, ask the
 * model, and hand back the extra result fields. A gateway failure NEVER fails
 * the caller's turn — it degrades to `answerError` beside the normal search
 * results.
 */

/** A finite number floored to an integer, or undefined. */
export function normalizeAskPosition(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/**
 * The positions the answer cites. The system prompt asks for `position N`, so
 * this reads back the model's own citations rather than inventing them; an
 * answer that cites nothing yields an empty array.
 */
/**
 * Citations are parsed from an explicit `[[cite:N]]` marker, never from the
 * prose. Matching `position N` instead read citations out of QUOTED transcript
 * content: a slice containing `SyntaxError: Unexpected token u in JSON at
 * position 4` produced a confident citation of entry 4 whenever the model
 * quoted that line — a wrong citation, which is worse than none. The bracket
 * form does not occur in transcript text.
 */
function citationsFromAnswer(answer: string, entries: ReadonlyArray<ThreadSearchEntry>) {
  const cited = new Set<number>();
  for (const match of answer.matchAll(/\[\[cite:\s*(\d+)\s*\]\]/gi)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) cited.add(parsed);
  }
  return entries
    .filter((entry) => cited.has(entry.position))
    .map((entry) => ({ position: entry.position, source: entry.source, id: entry.id }));
}

export function buildThreadAskFields(input: {
  readonly entries: ReadonlyArray<ThreadSearchEntry>;
  readonly matches?: ReadonlyArray<ThreadAskSpanMatch> | undefined;
  readonly question: string;
  readonly fromPosition?: number | undefined;
  readonly toPosition?: number | undefined;
  readonly ask: ThreadAskFn;
}): Effect.Effect<Record<string, unknown>, never> {
  const hasExplicit = input.fromPosition !== undefined || input.toPosition !== undefined;
  const span = selectThreadAskSpan({
    entries: input.entries,
    ...(input.matches ? { matches: input.matches } : {}),
    ...(input.fromPosition !== undefined ? { fromPosition: input.fromPosition } : {}),
    ...(input.toPosition !== undefined ? { toPosition: input.toPosition } : {}),
    // A large span is opt-in: only an explicit from/to unlocks the ceiling.
    budgetTokens: hasExplicit ? T3TEAM_ASK_MAX_SPAN_TOKENS : T3TEAM_ASK_DEFAULT_SPAN_TOKENS,
  });
  const promptTokensEstimate =
    span.promptTokensEstimate +
    estimateAskTokens(T3TEAM_ASK_SYSTEM_PROMPT) +
    estimateAskTokens(input.question);
  const spanUsed = {
    fromPosition: span.fromPosition,
    toPosition: span.toPosition,
    entryCount: span.entryCount,
  };

  return Effect.gen(function* () {
    if (span.entryCount === 0) {
      return {
        spanUsed,
        promptTokensEstimate,
        answerError: "No transcript entries fell inside the requested span.",
      };
    }
    const asked = yield* Effect.tryPromise({
      try: () => input.ask({ question: input.question, transcript: span.transcript }),
      // Keep the gateway's own words: a wrapped "Effect.tryPromise" string
      // tells the calling agent nothing about why the ask failed.
      catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
    }).pipe(Effect.result);
    if (asked._tag === "Failure") {
      const reason = asked.failure;
      return {
        spanUsed,
        promptTokensEstimate,
        ...(span.truncated ? { truncated: true } : {}),
        answerError: `Could not answer the question: ${reason}`.slice(0, 400),
      };
    }
    return {
      answer: asked.success,
      citations: citationsFromAnswer(asked.success, span.entries),
      spanUsed,
      promptTokensEstimate,
      ...(span.truncated ? { truncated: true } : {}),
    };
  });
}
