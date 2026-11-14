import {
  CommandId,
  MessageId,
  withT3TeamMessageExtContext,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  formatRichChoicePick,
  type RichChoicePayload,
} from "@t3tools/shared/t3team-richChoicePayload";
import { buildT3TeamWidgetPromptTransport } from "@t3tools/shared/t3team-widgetPromptTransport";
import { uuidv4 } from "../lib/uuid";
import { enqueueThreadOutboxMessage } from "./thread-outbox";

/**
 * Sends a rich-choice pick as the same hidden, agent-visible widget action message the web sends
 * (one shared builder), through the durable outbox mobile sends every message through. Resolves
 * once the message is saved for delivery; rejects when it could not be saved, so the card can
 * show the failure and allow a retry. Queued behind an active run, never steered into it.
 */
export async function sendT3TeamRichChoicePick(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly widgetId: string;
  readonly widgetTitle: string;
  readonly payload: RichChoicePayload;
  readonly pickedIds: ReadonlyArray<string>;
}): Promise<void> {
  const transport = buildT3TeamWidgetPromptTransport({
    widgetId: input.widgetId,
    widgetTitle: input.widgetTitle,
    text: formatRichChoicePick(input.payload, input.pickedIds),
  });
  const context = withT3TeamMessageExtContext(transport.t3teamExt);
  await enqueueThreadOutboxMessage({
    environmentId: input.environmentId,
    threadId: input.threadId,
    messageId: MessageId.make(uuidv4()),
    commandId: CommandId.make(uuidv4()),
    text: transport.text,
    ...(context ? { context } : {}),
    attachments: [],
    dispatchMode: "queue",
    createdAt: new Date().toISOString(),
  });
}
