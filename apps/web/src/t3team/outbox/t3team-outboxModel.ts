/**
 * The t3team offline send queue (outbox) model.
 *
 * While the environment connection is down, sendable t3team composer actions
 * (turn starts, workflow `askUser` answers, recipe card actions, staged
 * composer actions) are enqueued locally instead of erroring. On reconnect
 * the queue drains FIFO. Every entry carries a client-generated id, and the
 * drain checks the thread read model for that id before re-dispatching, so a
 * send whose acknowledgement was lost during the disconnect cannot create a
 * duplicate turn (the server does not dedupe by message id).
 */
import { isTransportConnectionErrorMessage } from "@t3tools/client-runtime/errors";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import { randomUUID } from "~/lib/utils";

export type T3TeamOutboxEntryKind =
  | "turn-start"
  | "workflow-answer"
  | "recipe-card-action"
  | "staged-action";

export interface T3TeamOutboxTurnStartPayload {
  readonly messageId: string;
  readonly messageText: string;
  readonly modelSelection: ModelSelection | null;
  readonly titleSeed: string;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly createdAt: string;
}

export interface T3TeamOutboxWorkflowAnswerPayload {
  readonly messageId: string;
  readonly text: string;
  readonly value: unknown;
  readonly correlationId: string | null;
}

export interface T3TeamOutboxRecipeCardActionPayload {
  readonly cardId: string;
  readonly actionId: string;
  readonly submit: Record<string, unknown> | null;
}

export interface T3TeamOutboxStagedActionPayload {
  readonly action: T3TeamStagedComposerAction;
  readonly composerText: string;
  readonly modelSelection: ModelSelection | null;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}

export interface T3TeamOutboxEntry {
  readonly entryId: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly createdAt: string;
  readonly kind: T3TeamOutboxEntryKind;
  readonly payload:
    | T3TeamOutboxTurnStartPayload
    | T3TeamOutboxWorkflowAnswerPayload
    | T3TeamOutboxRecipeCardActionPayload
    | T3TeamOutboxStagedActionPayload;
}

export function newT3TeamOutboxEntryId(): string {
  return randomUUID();
}

export function makeT3TeamOutboxEntry(
  kind: T3TeamOutboxEntryKind,
  payload: T3TeamOutboxEntry["payload"],
  environmentId: string,
  threadId: string,
): T3TeamOutboxEntry {
  return {
    entryId: newT3TeamOutboxEntryId(),
    environmentId,
    threadId,
    createdAt: new Date().toISOString(),
    kind,
    payload,
  };
}

const OUTBOX_KINDS: ReadonlySet<string> = new Set([
  "turn-start",
  "workflow-answer",
  "recipe-card-action",
  "staged-action",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Runtime validation for entries read back from durable storage. */
export function decodeT3TeamOutboxEntry(raw: unknown): T3TeamOutboxEntry | null {
  if (!isRecord(raw)) return null;
  const { entryId, environmentId, threadId, createdAt, kind, payload } = raw;
  if (
    typeof entryId !== "string" ||
    typeof environmentId !== "string" ||
    typeof threadId !== "string" ||
    typeof createdAt !== "string" ||
    typeof kind !== "string" ||
    !OUTBOX_KINDS.has(kind)
  ) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const kindMatches =
    isRecord(record) &&
    (kind === "turn-start"
      ? typeof record.messageId === "string" &&
        typeof record.messageText === "string" &&
        typeof record.createdAt === "string"
      : kind === "workflow-answer"
        ? typeof record.messageId === "string" && typeof record.text === "string"
        : kind === "recipe-card-action"
          ? typeof record.cardId === "string" && typeof record.actionId === "string"
          : "action" in record);
  if (!kindMatches) return null;
  return {
    entryId,
    environmentId,
    threadId,
    createdAt,
    kind: kind as T3TeamOutboxEntryKind,
    payload: record as unknown as T3TeamOutboxEntry["payload"],
  };
}

/** FIFO per environment: createdAt order, entry id breaking ties. */
export function groupT3TeamOutboxEntriesByEnvironment(
  entries: ReadonlyArray<T3TeamOutboxEntry>,
): Record<string, T3TeamOutboxEntry[]> {
  const byEnvironment: Record<string, T3TeamOutboxEntry[]> = {};
  for (const entry of entries) {
    (byEnvironment[entry.environmentId] ??= []).push(entry);
  }
  for (const queue of Object.values(byEnvironment)) {
    queue.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.entryId.localeCompare(right.entryId),
    );
  }
  return byEnvironment;
}

/** Same backoff ladder as the mobile outbox drain: 1s, 2s, 4s, ..., capped at 16s. */
export function t3TeamOutboxRetryDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 16_000);
}

/**
 * How long a dispatched turn-start is shielded from being re-sent while its
 * acknowledgement is being confirmed against the (re-synced) thread read
 * model. The server does not dedupe turns by message id, so once a send has
 * been attempted the client must not fire it again until the read model
 * confirms the message is absent — long enough for the read model to have
 * re-synced after a reconnect.
 */
export const OUTBOX_CONFIRMATION_TIMEOUT_MS = 90_000;

/** How long a cross-tab dispatch claim stays authoritative before another tab may take over. */
export const OUTBOX_CLAIM_TTL_MS = 45_000;

/** Short human preview for the queued-send timeline row. */
export function t3TeamOutboxEntryPreview(entry: T3TeamOutboxEntry): string {
  switch (entry.kind) {
    case "turn-start":
      return (entry.payload as T3TeamOutboxTurnStartPayload).messageText;
    case "workflow-answer":
      return (entry.payload as T3TeamOutboxWorkflowAnswerPayload).text;
    case "recipe-card-action":
      return (entry.payload as T3TeamOutboxRecipeCardActionPayload).actionId;
    case "staged-action": {
      const payload = entry.payload as T3TeamOutboxStagedActionPayload;
      return payload.composerText.trim() !== "" ? payload.composerText : "staged action";
    }
  }
}

function outboxErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return typeof error === "string" ? error : null;
}

/**
 * Whether a failed dispatch is a connectivity failure worth retrying once the
 * environment is back. Anything the server actually answered (validation,
 * invariant rejection) is permanent: the entry is surfaced as failed instead.
 */
export function isTransientT3TeamOutboxError(error: unknown): boolean {
  const message = outboxErrorMessage(error);
  if (message === null) return false;
  if (isTransportConnectionErrorMessage(message)) return true;
  // The t3team HTTP backend wraps fetch-level failures in "Failed to reach
  // backend …"; HTTP status errors surface as business errors instead.
  return message.startsWith("Failed to reach backend");
}
