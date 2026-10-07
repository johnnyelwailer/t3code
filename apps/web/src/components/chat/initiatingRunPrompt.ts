import type { ChatMessage } from "~/types";

/**
 * The string a run's copy control writes.
 *
 * A run stores one initiating prompt: the user message, an agent-delegated
 * brief, a scheduled-task prompt, or an inter-agent message. That string is
 * copied as stored. System triggers and tool continuations store no initiating
 * prompt (a wake sentence or a provider request is not one), so the control
 * stays hidden.
 */
export function initiatingRunPromptText(
  message: Pick<
    ChatMessage,
    | "role"
    | "text"
    | "createdBy"
    | "creationSource"
    | "scheduledTaskId"
    | "senderThreadId"
    | "promptTrigger"
    | "t3teamExt"
  >,
): string | null {
  if (message.role !== "user") return null;
  if (message.text.trim().length === 0) return null;
  if (message.t3teamExt?.visibleToUser === false) return null;
  if (message.promptTrigger === true || message.t3teamExt?.notification === true) return null;

  if (message.scheduledTaskId !== undefined) return message.text;
  if (message.senderThreadId !== undefined) return message.text;
  if (message.t3teamExt?.actor !== undefined) return message.text;
  if (message.t3teamExt?.author?.kind === "workflow") return message.text;

  // Server continuations ("Continue where you left off.") and anonymous system
  // dispatches are triggers. They are not one of the stored initiating prompts.
  if (message.creationSource === "server") return null;
  if (message.createdBy === "system") return null;

  return message.text;
}

/** Conversation messages whose text is a wake, not an initiating prompt. */
export function collectPromptTriggerMessageIds(
  messages: ReadonlyArray<{
    readonly id: string;
    readonly scheduledTaskId?: string | undefined;
    readonly senderThreadId?: string | undefined;
    readonly notification?: unknown;
    readonly delegatedCompletion?: unknown;
  }>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.scheduledTaskId !== undefined || message.senderThreadId !== undefined) continue;
    if (message.notification !== undefined || message.delegatedCompletion !== undefined) {
      ids.add(message.id);
    }
  }
  return ids;
}
