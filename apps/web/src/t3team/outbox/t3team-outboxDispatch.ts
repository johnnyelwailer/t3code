/**
 * Dispatching one queued t3team outbox entry to the environment.
 *
 * turn-start and workflow-answer entries carry a client-generated message id.
 * Before re-dispatching, the drain asks whether the thread read model already
 * holds a user message with that id: if so the original send was accepted
 * server-side (its acknowledgement simply did not survive the disconnect)
 * and the entry is discarded instead of being posted again — the server does
 * not dedupe turns by message id, so the client owns this guarantee. When the
 * read model has not loaded yet the entry defers rather than risks a
 * duplicate.
 *
 * recipe-card-action and staged-action have no server-side dedupe; they are
 * retried only for connectivity-level failures, accepting the narrow window
 * where a response was lost after the server processed the request.
 */
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";

import {
  isTransientT3TeamOutboxError,
  OUTBOX_CONFIRMATION_TIMEOUT_MS,
  type T3TeamOutboxEntry,
  type T3TeamOutboxRecipeCardActionPayload,
  type T3TeamOutboxStagedActionPayload,
  type T3TeamOutboxTurnStartPayload,
  type T3TeamOutboxWorkflowAnswerPayload,
} from "~/t3team/outbox/t3team-outboxModel";

export type T3TeamOutboxDispatchOutcome =
  | { readonly outcome: "delivered" }
  | { readonly outcome: "retry" }
  | { readonly outcome: "failed"; readonly error: string };

export interface T3TeamOutboxDispatchDeps {
  readonly startTurn: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: StartThreadTurnInput;
  }) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly resolveWorkflowInput: (input: {
    readonly threadId: string;
    readonly text: string;
    readonly messageId: string;
    readonly value?: unknown;
    readonly correlationId?: string;
  }) => Promise<void>;
  readonly submitRecipeCardAction: (input: {
    readonly threadId: string;
    readonly cardId: string;
    readonly actionId: string;
    readonly submit?: Record<string, unknown>;
  }) => Promise<unknown>;
  readonly launchStagedAction: (payload: T3TeamOutboxStagedActionPayload) => Promise<boolean>;
  /**
   * Does the thread's read model contain a user message with this id?
   * `null` means the read model has not loaded — treat as "unknown", not "no".
   */
  readonly threadHasUserMessage: (
    environmentId: string,
    threadId: string,
    messageId: string,
  ) => boolean | null;
  /** Epoch ms the entry's turn was last attempted, or null (see model timeout). */
  readonly outboxAttemptTs: (entryId: string) => number | null;
  /** Durable: records that this entry's turn was just dispatched. */
  readonly recordOutboxAttempt: (entryId: string) => void;
}

function failureText(result: AtomCommandResult<unknown, unknown>): string {
  if (result._tag !== "Failure") return "The message could not be sent.";
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The message could not be sent.";
}

async function dispatchTurnStart(
  entry: T3TeamOutboxEntry,
  deps: T3TeamOutboxDispatchDeps,
): Promise<T3TeamOutboxDispatchOutcome> {
  const payload = entry.payload as T3TeamOutboxTurnStartPayload;
  const seen = deps.threadHasUserMessage(entry.environmentId, entry.threadId, payload.messageId);
  if (seen === true) return { outcome: "delivered" };
  if (seen === null) return { outcome: "retry" };
  // `seen === false`: the read model is loaded and lacks the id. The server does
  // not dedupe turns, so if we already fired this send and are still inside the
  // confirmation window, the acknowledgement is likely just in flight — do not
  // fire it again (a lost-ACK reconnect is the exact case this guards).
  const attemptedAt = deps.outboxAttemptTs(entry.entryId);
  if (attemptedAt !== null && Date.now() - attemptedAt < OUTBOX_CONFIRMATION_TIMEOUT_MS) {
    return { outcome: "retry" };
  }
  deps.recordOutboxAttempt(entry.entryId);
  const result = await deps.startTurn({
    environmentId: entry.environmentId as EnvironmentId,
    input: {
      threadId: entry.threadId as ThreadId,
      message: {
        messageId: payload.messageId as MessageId,
        role: "user",
        text: payload.messageText,
        attachments: [],
      },
      ...(payload.modelSelection !== null ? { modelSelection: payload.modelSelection } : {}),
      titleSeed: payload.titleSeed,
      runtimeMode: payload.runtimeMode,
      interactionMode: payload.interactionMode,
      createdAt: payload.createdAt,
    },
  });
  if (result._tag === "Success") return { outcome: "delivered" };
  const error = failureText(result);
  if (isAtomCommandInterrupted(result) || !isTransientT3TeamOutboxError(error)) {
    return { outcome: "failed", error };
  }
  return { outcome: "retry" };
}

async function dispatchWorkflowAnswer(
  entry: T3TeamOutboxEntry,
  deps: T3TeamOutboxDispatchDeps,
): Promise<T3TeamOutboxDispatchOutcome> {
  const payload = entry.payload as T3TeamOutboxWorkflowAnswerPayload;
  const seen = deps.threadHasUserMessage(entry.environmentId, entry.threadId, payload.messageId);
  if (seen === true) return { outcome: "delivered" };
  if (seen === null) return { outcome: "retry" };
  try {
    await deps.resolveWorkflowInput({
      threadId: entry.threadId,
      text: payload.text,
      messageId: payload.messageId,
      ...(payload.value !== undefined ? { value: payload.value } : {}),
      ...(payload.correlationId !== null ? { correlationId: payload.correlationId } : {}),
    });
    return { outcome: "delivered" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isTransientT3TeamOutboxError(error)
      ? { outcome: "retry" }
      : { outcome: "failed", error: message };
  }
}

async function dispatchRecipeCardAction(
  entry: T3TeamOutboxEntry,
  deps: T3TeamOutboxDispatchDeps,
): Promise<T3TeamOutboxDispatchOutcome> {
  const payload = entry.payload as T3TeamOutboxRecipeCardActionPayload;
  try {
    await deps.submitRecipeCardAction({
      threadId: entry.threadId,
      cardId: payload.cardId,
      actionId: payload.actionId,
      ...(payload.submit !== null ? { submit: payload.submit } : {}),
    });
    return { outcome: "delivered" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isTransientT3TeamOutboxError(error)
      ? { outcome: "retry" }
      : { outcome: "failed", error: message };
  }
}

async function dispatchStagedAction(
  entry: T3TeamOutboxEntry,
  deps: T3TeamOutboxDispatchDeps,
): Promise<T3TeamOutboxDispatchOutcome> {
  const launched = await deps.launchStagedAction(entry.payload as T3TeamOutboxStagedActionPayload);
  return launched ? { outcome: "delivered" } : { outcome: "retry" };
}

export async function dispatchT3TeamOutboxEntry(
  entry: T3TeamOutboxEntry,
  deps: T3TeamOutboxDispatchDeps,
): Promise<T3TeamOutboxDispatchOutcome> {
  switch (entry.kind) {
    case "turn-start":
      return dispatchTurnStart(entry, deps);
    case "workflow-answer":
      return dispatchWorkflowAnswer(entry, deps);
    case "recipe-card-action":
      return dispatchRecipeCardAction(entry, deps);
    case "staged-action":
      return dispatchStagedAction(entry, deps);
  }
}
