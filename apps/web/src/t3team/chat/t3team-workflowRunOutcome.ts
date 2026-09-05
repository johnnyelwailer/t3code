/**
 * Deriving a SHORT, honest status-line addition for a workflow run's shape card banner.
 *
 * `deliverWorkflowCompletion`/`deliverWorkflowFailure` (server, see
 * `t3team-workflowCompletionMessage.ts`) post the run's full terminal result as an ordinary chat
 * message, id `t3team-wf-result:<runId>`. That message renders normally, in full, as markdown in
 * the transcript — that IS the Defect 1 fix: a nested or long result reaches the reader as
 * readable rendered content, never dropped and never squashed into something else.
 *
 * The run's shape card banner is a STATUS LINE, not a report. It may add a short derived outcome
 * ("Completed · 2 findings") ONLY when the message's own resolved text is ALREADY short and
 * plain — the server's own `summary`/`message`/`text`/`result` short-circuit, or a tiny flat
 * record. Anything longer, multi-line, or carrying markdown block syntax (headings, fences,
 * bullets) is a document, not a status word — it is never truncated or flattened for the banner;
 * it is left to render in full in the message body, and the banner shows only the plain status.
 */
import { workflowCompletionDisplayText } from "~/t3team/chat/t3team-workflowCompletionDisplayText";
import type { ChatMessage } from "~/types";

const RUN_RESULT_MESSAGE_PREFIX = "t3team-wf-result:";
const SHORT_SUMMARY_MAX_CHARS = 100;
// The two generic placeholders `workflowCompletionDisplayText`/`formatWorkflowOutput` fall back
// to when a run genuinely returns nothing readable — showing either verbatim beside the phase
// label would just repeat what the label already says.
const GENERIC_OUTCOME_TEXTS = new Set(["Workflow completed.", "Orchestration completed."]);

/**
 * True when `text` is safe to show verbatim in a compact, plain-text status line: short,
 * single-line, and free of markdown block syntax that would read as broken formatting once
 * shown outside a markdown renderer. Anything else is left alone — never truncated, never
 * flattened — so a real document only ever renders in the message body.
 */
function isBannerSafeOutcome(text: string): boolean {
  if (text.length === 0 || text.length > SHORT_SUMMARY_MAX_CHARS) return false;
  if (text.includes("\n")) return false;
  if (text.startsWith("#")) return false;
  if (text.includes("```")) return false;
  if (/^[-*]\s/.test(text)) return false;
  return true;
}

/**
 * `workflowRunId` -> a short, honest outcome line for that run's terminal banner, when one
 * exists. Absent means "show only the status" — never a fabricated or truncated stand-in.
 */
export function findT3TeamWorkflowRunOutcomeSummaries(
  timelineEntries: ReadonlyArray<{ readonly kind: string; readonly message?: ChatMessage }>,
): ReadonlyMap<string, string> {
  const summaries = new Map<string, string>();
  for (const entry of timelineEntries) {
    if (entry.kind !== "message" || entry.message === undefined) continue;
    const message = entry.message;
    if (!message.id.startsWith(RUN_RESULT_MESSAGE_PREFIX)) continue;
    const runId = message.id.slice(RUN_RESULT_MESSAGE_PREFIX.length);
    if (runId.length === 0) continue;
    const text = workflowCompletionDisplayText(message.id, message.text).trim();
    if (!isBannerSafeOutcome(text) || GENERIC_OUTCOME_TEXTS.has(text)) continue;
    // Markdown bold markers render fine inline in the message body; the banner is plain text.
    summaries.set(runId, text.replaceAll("**", ""));
  }
  return summaries;
}
