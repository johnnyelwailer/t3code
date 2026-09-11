import type { ThreadSearchEntry } from "./t3team-threadMessageSearch.ts";

/**
 * Span selection and budgeting for `t3team.thread.search` question mode.
 *
 * The token ceiling below is what the model route accepts, NOT a default. A
 * 135k-token request to `qwen3.8-27b-nvfp4-mtp-192k` took 29s cold on the
 * shared GPU, so prefill is the dominant cost: the default span is small and a
 * large span is opt-in via explicit `fromPosition`/`toPosition`.
 */

export const T3TEAM_ASK_TOKEN_CEILING = 196_608;
/** Headroom for the system prompt, the question and the answer. */
export const T3TEAM_ASK_RESERVE_TOKENS = 4_096;
export const T3TEAM_ASK_MAX_SPAN_TOKENS = T3TEAM_ASK_TOKEN_CEILING - T3TEAM_ASK_RESERVE_TOKENS;
/** Default budget for the cheap `query` + `question` path. */
export const T3TEAM_ASK_DEFAULT_SPAN_TOKENS = 8_000;
/** Keep the JSON request body clear of a 1 MB payload target. */
export const T3TEAM_ASK_MAX_SPAN_BYTES = 768_000;
export const T3TEAM_ASK_NEIGHBOURHOOD_ENTRIES = 2;

/**
 * Cap on the rendered text of ONE entry. Activity payloads are already capped
 * upstream, but message text is not — a single pasted build log can be
 * megabytes. Without a per-entry cap, an explicit one-entry span sails past
 * every budget below, because narrowing can only drop whole entries and must
 * leave at least one.
 */
export const T3TEAM_ASK_MAX_ENTRY_CHARS = 40_000;

/**
 * Budgeting estimate, deliberately NOT a tokenizer — but it must never
 * UNDERSHOOT, or the request is rejected by the gateway with a 400 after we
 * have already paid to build it. ASCII runs at roughly 4 characters per token;
 * CJK, emoji and other non-Latin text run closer to one token per character,
 * so counting those at ÷4 underestimates by about 4×. Count them at 1.
 */
export function estimateAskTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const char of text) {
    if (char.codePointAt(0)! < 128) ascii += 1;
    else wide += 1;
  }
  return Math.ceil(ascii / 4) + wide;
}

/**
 * Deterministic rendering: the same entry must serialize to the same bytes on
 * every call, or the gateway's prompt cache cannot reuse the prefix. No
 * wall-clock, no elapsed time, no run ids in here.
 */
export function renderAskEntry(entry: ThreadSearchEntry): string {
  const head = `[position ${entry.position} | ${entry.source} | ${entry.label}]\n`;
  if (entry.text.length <= T3TEAM_ASK_MAX_ENTRY_CHARS) return head + entry.text;
  // Keep both ends: a long log states its verdict at the end, so a head-only
  // cut keeps the banner and drops the failure. Deterministic, so the prompt
  // cache still sees identical bytes for an identical entry.
  const keep = Math.floor(T3TEAM_ASK_MAX_ENTRY_CHARS / 2);
  const dropped = entry.text.length - T3TEAM_ASK_MAX_ENTRY_CHARS;
  return `${head}${entry.text.slice(0, keep)}\n… [${dropped} characters elided from the middle] …\n${entry.text.slice(-keep)}`;
}

export type ThreadAskSpanMatch = {
  readonly position: number;
  readonly source: "message" | "activity";
};

export type ThreadAskSpan = {
  readonly entries: ThreadSearchEntry[];
  readonly transcript: string;
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly entryCount: number;
  readonly truncated: boolean;
  readonly promptTokensEstimate: number;
};

function explicitSpan(
  entries: ReadonlyArray<ThreadSearchEntry>,
  from: number | undefined,
  to: number | undefined,
): ThreadSearchEntry[] {
  const low = from ?? Number.NEGATIVE_INFINITY;
  const high = to ?? Number.POSITIVE_INFINITY;
  return entries.filter((entry) => entry.position >= low && entry.position <= high);
}

/**
 * The matched entries plus `T3TEAM_ASK_NEIGHBOURHOOD_ENTRIES` on either side,
 * deduplicated and kept in chronological order. The span START is therefore
 * anchored to the earliest match's neighbourhood — a stable position — rather
 * than counted back from the tail, so a repeated ask reuses the cached prefix.
 */
function neighbourhoodSpan(
  entries: ReadonlyArray<ThreadSearchEntry>,
  matches: ReadonlyArray<ThreadAskSpanMatch>,
): ThreadSearchEntry[] {
  const keep = new Set<number>();
  for (const match of matches) {
    const index = entries.findIndex(
      (entry) => entry.source === match.source && entry.position === match.position,
    );
    if (index < 0) continue;
    const first = Math.max(0, index - T3TEAM_ASK_NEIGHBOURHOOD_ENTRIES);
    const last = Math.min(entries.length - 1, index + T3TEAM_ASK_NEIGHBOURHOOD_ENTRIES);
    for (let cursor = first; cursor <= last; cursor += 1) keep.add(cursor);
  }
  return entries.filter((_entry, index) => keep.has(index));
}

/** Drop entries from the OLDEST end until both budgets fit. Never refuses. */
function narrowToBudget(
  selected: ThreadSearchEntry[],
  budgetTokens: number,
): { entries: ThreadSearchEntry[]; truncated: boolean } {
  const rendered = selected.map(renderAskEntry);
  const bytes = rendered.map((text) => Buffer.byteLength(text, "utf8") + 2);
  const tokens = rendered.map((text) => estimateAskTokens(text) + 1);
  let start = 0;
  let totalTokens = tokens.reduce((sum, value) => sum + value, 0);
  let totalBytes = bytes.reduce((sum, value) => sum + value, 0);
  const overBudget = () => totalTokens > budgetTokens || totalBytes > T3TEAM_ASK_MAX_SPAN_BYTES;
  while (start < selected.length - 1 && overBudget()) {
    totalTokens -= tokens[start]!;
    totalBytes -= bytes[start]!;
    start += 1;
  }
  // Narrowing can only drop WHOLE entries and must leave one, so a single
  // outsized entry would otherwise sail past the budget and be reported as
  // untruncated. Per-entry capping in renderAskEntry bounds that case; report
  // it as truncated so the caller is never told it saw the whole span.
  const cappedEntry = overBudget();
  return { entries: selected.slice(start), truncated: start > 0 || cappedEntry };
}

export function selectThreadAskSpan(input: {
  readonly entries: ReadonlyArray<ThreadSearchEntry>;
  readonly matches?: ReadonlyArray<ThreadAskSpanMatch> | undefined;
  readonly fromPosition?: number | undefined;
  readonly toPosition?: number | undefined;
  readonly budgetTokens: number;
}): ThreadAskSpan {
  const hasExplicit = input.fromPosition !== undefined || input.toPosition !== undefined;
  const selected = hasExplicit
    ? explicitSpan(input.entries, input.fromPosition, input.toPosition)
    : input.matches && input.matches.length > 0
      ? neighbourhoodSpan(input.entries, input.matches)
      : [...input.entries];

  const budget = Math.min(input.budgetTokens, T3TEAM_ASK_MAX_SPAN_TOKENS);
  const narrowed = narrowToBudget(selected, budget);
  const transcript = narrowed.entries.map(renderAskEntry).join("\n\n");
  const positions = narrowed.entries.map((entry) => entry.position);
  return {
    entries: narrowed.entries,
    transcript,
    fromPosition: positions.length > 0 ? Math.min(...positions) : 0,
    toPosition: positions.length > 0 ? Math.max(...positions) : 0,
    entryCount: narrowed.entries.length,
    truncated: narrowed.truncated,
    promptTokensEstimate: estimateAskTokens(transcript),
  };
}
