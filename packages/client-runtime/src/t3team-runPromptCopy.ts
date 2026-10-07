/**
 * The string a run's hover copy control writes. It is the initiating text stored on the
 * user message that started the run: a person's message, a delegated brief, a scheduled
 * prompt, or an inter-agent message. Adapter-built provider requests are not stored here.
 */
import type {
  OrchestrationMessageContext,
  OrchestrationV2Actor,
  OrchestrationV2CreationSource,
  ScheduledTaskId,
  ThreadId,
  T3TeamMessageExt,
} from "@t3tools/contracts";

import { readT3TeamMessageExt } from "./state/t3team-messageFraming.ts";
import { resolveUserMessagePresentation } from "./userMessage.ts";

export interface RunInitiatingPromptMessage {
  readonly id?: string | undefined;
  readonly role: string;
  readonly text: string;
  readonly createdBy?: OrchestrationV2Actor | undefined;
  readonly creationSource?: OrchestrationV2CreationSource | undefined;
  readonly scheduledTaskId?: ScheduledTaskId | undefined;
  readonly senderThreadId?: ThreadId | undefined;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly t3teamExt?: T3TeamMessageExt | undefined;
}

/**
 * The original initiating string, or null when this run has nothing to copy
 * (a system trigger, a tool continuation, or an empty prompt).
 */
export function resolveRunInitiatingPrompt(message: RunInitiatingPromptMessage): string | null {
  if (message.role !== "user") return null;
  const ext = message.t3teamExt ?? readT3TeamMessageExt(message.context);
  if (ext?.visibleToUser === false) return null;

  const presentation = resolveUserMessagePresentation({
    role: message.role,
    text: message.text,
    ...(message.id !== undefined ? { id: message.id } : {}),
    ...(message.createdBy !== undefined ? { createdBy: message.createdBy } : {}),
    ...(message.scheduledTaskId !== undefined ? { scheduledTaskId: message.scheduledTaskId } : {}),
  });
  // A work-item send stores the person's words separately from the provider prompt.
  const stored = ext?.displayText !== undefined ? ext.displayText : presentation.text;
  if (stored.trim().length === 0) return null;

  if (message.scheduledTaskId !== undefined || presentation.isAutomation) return stored;
  // Delegated briefs and inter-agent messages name the sending thread.
  if (message.createdBy === "agent" && message.senderThreadId !== undefined) return stored;
  // A person typed this. A server-created user row is a resume, not that prompt.
  if (
    (message.createdBy === "user" || message.createdBy === undefined) &&
    message.creationSource !== "server"
  ) {
    return stored;
  }
  // Workflow prompts name their author; anonymous system rows are triggers.
  if (message.createdBy === "system" && ext?.author !== undefined) return stored;
  return null;
}
