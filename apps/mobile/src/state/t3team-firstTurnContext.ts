import { ComposerContextId, UnknownContextRecord } from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  formatComposerContextReference,
} from "@t3tools/shared/composerContextReferences";
import * as Schema from "effect/Schema";

import type { QueuedThreadMessage } from "./thread-outbox-model";

/** Facts a distribution gives the agent with a draft's first turn; the user sees them as one chip. */
export interface FirstTurnContext {
  /** The chip's label, e.g. "Cloud session notice". */
  readonly label: string;
  /** What the agent reads in the turn's context envelope. */
  readonly text: string;
}

// Not an upstream record kind: clients show it as a plain chip and the server projects its payload.
const KIND = "setup-note";
const CONTEXT_ID = ComposerContextId.make("setup-note");
const decodeRecord = Schema.decodeUnknownOption(UnknownContextRecord);

/**
 * The message with `context` attached as a composer context record that its text references, the
 * way the composer attaches a file or thread, so the agent reads it and the user sees a chip, not
 * typed text. A missing reference or record is restored; unchanged without context, when both are
 * there, or when it does not fit.
 */
export function withFirstTurnContext(
  message: QueuedThreadMessage,
  context: FirstTurnContext | undefined,
): QueuedThreadMessage {
  if (context === undefined) return message;
  const referenced = collectComposerContextReferences(message.text).some(
    (reference) => reference.contextId === CONTEXT_ID,
  );
  const records = message.context?.records ?? [];
  const others = records.filter((record) => record.contextId !== CONTEXT_ID);
  if (referenced && others.length < records.length) return message;
  const record = decodeRecord({
    version: 1,
    contextId: CONTEXT_ID,
    label: context.label,
    kind: KIND,
    payload: context.text,
  });
  if (record._tag === "None") return message;
  const reference = formatComposerContextReference(record.value);
  return {
    ...message,
    text: referenced
      ? message.text
      : message.text.length > 0
        ? `${message.text}\n\n${reference}`
        : reference,
    context: { version: 1, records: [...others, record.value] },
  };
}
