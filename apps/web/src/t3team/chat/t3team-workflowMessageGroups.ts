/**
 * Grouping a workflow step's machine traffic into one collapsible row.
 *
 * An `askAgent` step posts a `role:"user"` prompt to drive a turn — because that is how a provider receives
 * turn input, not because a person wrote it — and the assistant replies that follow are the model working. All
 * of it carried the user's own styling, so nine paragraphs of "Before writing, READ the work item for
 * context…" read as something PJ had typed.
 *
 * Every message of the step shares `author.stepId`, so the whole exchange collapses to one row summarised by
 * `author.label`. One row per STEP, not per message: the reader cares that a step ran and what it was for, and
 * can expand when they want the transcript. Never hidden — observability over gates.
 *
 * ── THE TRAP ────────────────────────────────────────────────────────────────────────────────────────
 * The run's COMPLETION message is `role:"assistant"` too, and deliberately carries NO workflow author: it is
 * the card with the `work-item-draft` attachment the user must click. So the rule is exactly
 * `author.kind === "workflow"` and never "an assistant message during a workflow run" — the latter swallows
 * the card the whole feature exists to surface.
 *
 * Rehydrated-after-restart steps stamp no author (documented degradation), so a thread can mix attributed and
 * unattributed workflow messages. Unattributed renders as it always did; nothing is guessed.
 */

import type { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";

/**
 * The minimum this needs from a message. Permissive about the rest on purpose: it reads real timeline
 * messages, which carry many more fields, and narrowing here would only force casts at every call site.
 */
type MessageLike = {
  readonly id: string;
  readonly t3teamExt?:
    | { readonly author?: { readonly kind: string } | undefined; readonly [key: string]: unknown }
    | undefined;
  readonly [key: string]: unknown;
};

export type T3TeamWorkflowStepGroup = {
  readonly stepId: string;
  readonly label: string;
  readonly workflowRunId: string;
  /** Message ids in timeline order; the first is the row's anchor. */
  readonly messageIds: ReadonlyArray<string>;
};

/** The workflow author, or `undefined` for a human message, a system notice, or the completion card. */
export function readT3TeamWorkflowAuthor(
  message: MessageLike | undefined,
): T3TeamMessageWorkflowAuthor | undefined {
  const author = message?.t3teamExt?.author;
  return author?.kind === "workflow" ? (author as T3TeamMessageWorkflowAuthor) : undefined;
}

/**
 * One group per `stepId`, in the order each step first appears.
 *
 * Messages of a step need not be contiguous — a system notice can land between the prompt and its reply — so
 * grouping is by id rather than by run-length.
 */
export function buildT3TeamWorkflowStepGroups(
  messages: ReadonlyArray<MessageLike>,
): ReadonlyArray<T3TeamWorkflowStepGroup> {
  const byStepId = new Map<string, { group: T3TeamWorkflowStepGroup; ids: string[] }>();
  const order: string[] = [];

  for (const message of messages) {
    const author = readT3TeamWorkflowAuthor(message);
    if (!author) continue;

    const existing = byStepId.get(author.stepId);
    if (existing) {
      existing.ids.push(message.id);
      continue;
    }
    const ids = [message.id];
    order.push(author.stepId);
    byStepId.set(author.stepId, {
      ids,
      group: {
        stepId: author.stepId,
        label: author.label,
        workflowRunId: author.workflowRunId,
        messageIds: ids,
      },
    });
  }

  return order.map((stepId) => byStepId.get(stepId)!.group);
}

export type T3TeamWorkflowGroupPlacement =
  | { readonly kind: "anchor"; readonly group: T3TeamWorkflowStepGroup }
  | { readonly kind: "member"; readonly group: T3TeamWorkflowStepGroup }
  | { readonly kind: "none" };

/**
 * What a row should do: render the collapsed summary (`anchor`), hide unless the group is expanded
 * (`member`), or render exactly as before (`none` — human messages, system notices, and the completion card).
 */
export function placeT3TeamWorkflowMessage(
  messageId: string,
  groups: ReadonlyArray<T3TeamWorkflowStepGroup>,
): T3TeamWorkflowGroupPlacement {
  for (const group of groups) {
    const index = group.messageIds.indexOf(messageId);
    if (index === -1) continue;
    return index === 0 ? { kind: "anchor", group } : { kind: "member", group };
  }
  return { kind: "none" };
}
