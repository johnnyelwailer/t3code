/**
 * Pure lookups over a projected thread for the workflow step re-drive (GHE #404 / #405).
 *
 * A re-drive must not stack a new turn on a step that was already answered (the child finished
 * while the run was paused) and must not adopt a turn that some OTHER prompt started on the
 * child thread. Both questions are answered from the message list alone, so they live here,
 * testable without the reactor.
 */
import type { OrchestrationThread } from "@t3tools/contracts";

/**
 * The projection lists messages `ORDER BY sequence`, and a streamed assistant reply can carry a
 * NULL sequence (it then sorts FIRST), so array order is not chronological here. Everything below
 * orders by `createdAt` instead.
 */
type Message = OrchestrationThread["messages"][number];

function messagesAfter(thread: OrchestrationThread, prompt: Message): Message[] {
  return thread.messages
    .filter((message) => message.id !== prompt.id && message.createdAt >= prompt.createdAt)
    .toSorted((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

function promptMessage(thread: OrchestrationThread, promptMessageId: string): Message | undefined {
  return thread.messages.find((message) => message.id === promptMessageId);
}

/**
 * The id of the thread's LATEST turn when that turn ended without completing — the projection
 * settles a dead turn as `interrupted`/`error`. The messages it streamed were preamble: they are
 * never a completed answer, no matter how plausible they read (a turn that died mid-stream is
 * exactly the case that used to settle a step with its truncated text).
 */
function deadLatestTurnId(thread: OrchestrationThread): string | null {
  const latest = thread.latestTurn ?? null;
  if (latest === null || (latest.state !== "interrupted" && latest.state !== "error")) {
    return null;
  }
  return String(latest.turnId);
}

/**
 * The completed assistant reply that answers `promptMessageId`, when one already exists:
 * the first non-streaming assistant message with text after the prompt, provided no newer user
 * message intervenes (a later prompt means the thread moved on and the reply may answer THAT).
 * Messages streamed by a turn that never completed are preamble and never count.
 */
export function findCompletedAnswer(
  thread: OrchestrationThread,
  promptMessageId: string,
): { readonly messageId: string; readonly text: string } | null {
  const prompt = promptMessage(thread, promptMessageId);
  if (prompt === undefined) return null;
  const deadTurnId = deadLatestTurnId(thread);
  for (const message of messagesAfter(thread, prompt)) {
    if (message.role === "user") return null;
    if (message.role !== "assistant" || message.streaming) continue;
    if (deadTurnId !== null && String(message.turnId) === deadTurnId) continue;
    const text = message.text.trim();
    if (text.length > 0) return { messageId: message.id, text };
  }
  return null;
}

/**
 * `true` when the workflow prompt is the thread's LAST user message — i.e. an active turn on the
 * thread can only have been started by that prompt (or its re-drive), never by a human steer or
 * another automation that arrived later.
 */
export function promptIsLatestUserMessage(
  thread: OrchestrationThread,
  promptMessageId: string,
): boolean {
  const prompt = promptMessage(thread, promptMessageId);
  if (prompt === undefined) return false;
  return !messagesAfter(thread, prompt).some((message) => message.role === "user");
}

/** The decider's rejection when the thread no longer ends in an unanswered prompt. */
export function isAnsweredPromptInvariant(detail: string): boolean {
  return detail.includes("does not end with unanswered user message");
}
