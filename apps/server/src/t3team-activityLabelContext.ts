import type { ModelSelection } from "@t3tools/contracts";

/**
 * Pure payload helpers for the live activity label (GHE #40): the tiny
 * hard-capped generation context, the label validator, and the cheap
 * skip-when-unchanged hash. Split out of `t3team-activityLabelSummarizer.ts`
 * so the debounced state machine stays under the additive-LOC guard.
 */

export type ActivityLabelGeneration = (input: {
  readonly modelSelection: ModelSelection;
  /** Pre-capped context (the caller caps to ~400 chars; the prompt builder re-caps). */
  readonly context: string;
}) => Promise<string | null>;

/** Last N activities that count as "meaningful work" for the label window. */
export const ACTIVITY_LABEL_WINDOW_SIZE = 5;

const ACTIVITY_SUMMARY_MAX_CHARS = 120;
const CONTEXT_MAX_CHARS = 400;

export const normalizeSummary = (summary: string): string =>
  summary.replaceAll(/\s+/g, " ").trim().slice(0, ACTIVITY_SUMMARY_MAX_CHARS);

/**
 * Validate a raw generated label. Returns the normalized label, or null when
 * unusable (callers treat null as "no label" → static "Working").
 */
export const parseActivityLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .split(/\r?\n/g)[0]
    ?.trim()
    .replace(/^["'`\[>+]+|["'`\]][\s\S]*$/g, "")
    .trim()
    .replace(/[\.,;:!?]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized || !/^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M} &+./-]*$/u.test(normalized)) {
    return null;
  }
  const words = normalized.split(" ").filter((word) => word.length > 0);
  if (words.length < 1 || words.length > 6 || normalized.length > 40) return null;
  return normalized;
};

/** Deterministic (non-cryptographic) string hash — cheap skip-when-unchanged key. */
export const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

/** Build the tiny, hard-capped generation context from the recent-activity window.
 *  Consecutive duplicate rows (repeated events for the same tool call) are
 *  collapsed so repeated events cannot grow or mutate the payload. */
export const buildActivityLabelContext = (
  window: ReadonlyArray<{ readonly kind: string; readonly summary: string }>,
  userGist: string | null | undefined,
): string => {
  const lines: string[] = [];
  for (const entry of window) {
    const line = `- ${entry.kind}: ${entry.summary}`;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  const gist = userGist?.trim();
  const context = [...(gist ? [`User intent: ${gist.slice(0, 100)}`] : []), ...lines].join("\n");
  // Absolute cap so the payload stays tiny no matter what the caller passed.
  return context.length > CONTEXT_MAX_CHARS ? context.slice(0, CONTEXT_MAX_CHARS) : context;
};
