/**
 * The first message of a draft that was sent while its chosen cloud session was still
 * provisioning, connecting or syncing. It lives on the draft's persisted composer state (see
 * `composerDraftStore`), so it survives navigating away and app restarts, and it carries the turn
 * exactly as the composer prepared it at send time: the app-level flusher dispatches it without
 * the composer being mounted. Store-free on purpose — the draft store imports the schema.
 */
import {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  type ModelSelection as ModelSelectionType,
  type ProviderInteractionMode as ProviderInteractionModeType,
  type RuntimeMode as RuntimeModeType,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { DeepMutable } from "effect/Types";

export const CloudQueuedSendSchema = Schema.Struct({
  messageId: Schema.String,
  /** What the user typed: the bubble, the sidebar preview and a cancel's restored prompt. */
  messageText: Schema.String,
  /** The provider-ready text (effort prefix applied), dispatched as-is. */
  outgoingText: Schema.String,
  titleSeed: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  /** The cloud session it waits for; the create sentinel until the create RPC answers. */
  sessionId: Schema.String,
  sessionLabel: Schema.String,
  /** The composer project the session was picked for (the Run-on target's), for its own project. */
  projectKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdAt: Schema.String,
  /** Set when the send cannot go through; the message stays until retried or cancelled. */
  failureMessage: Schema.optionalKey(Schema.String),
  /** False when retrying cannot help (the session ended): only cancel is offered. */
  retryable: Schema.optionalKey(Schema.Boolean),
  /** When each bind step was first seen (step id -> ISO time), for per-step elapsed. */
  stepStartedAt: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  /** Why the send failed, when the reason is typed (the message is only its wording). */
  // A string, not a literal union: a record a newer build wrote must still decode (a record that
  // fails to decode is dropped, and the message with it).
  failureKind: Schema.optionalKey(Schema.String),
  /** The classifier's reason (`CloudProjectWaitReason`) for a `project_not_resolved` failure. */
  failureReason: Schema.optionalKey(Schema.String),
  /** The user chose to send in the machine's own project instead of the draft's. */
  sendInMachineProject: Schema.optionalKey(Schema.Boolean),
});

export interface CloudQueuedSend {
  readonly messageId: string;
  readonly messageText: string;
  readonly outgoingText: string;
  readonly titleSeed: string;
  readonly modelSelection: ModelSelectionType;
  readonly runtimeMode: RuntimeModeType;
  readonly interactionMode: ProviderInteractionModeType;
  readonly sessionId: string;
  readonly sessionLabel: string;
  readonly projectKey?: string | null;
  readonly createdAt: string;
  readonly failureMessage?: string;
  readonly retryable?: boolean;
  readonly stepStartedAt?: Readonly<Record<string, string>>;
  readonly failureKind?: string;
  readonly failureReason?: string;
  readonly sendInMachineProject?: boolean;
}

const decodeUnknown = Schema.decodeUnknownOption(CloudQueuedSendSchema);

/** The persisted record, or null when it is absent or no longer decodes. */
export function decodeCloudQueuedSend(value: unknown): CloudQueuedSend | null {
  if (value === undefined || value === null) return null;
  const decoded = decodeUnknown(value);
  return decoded._tag === "Some" ? decoded.value : null;
}

/** A detached, mutable copy in the persisted shape (the draft store writes mutable records). */
export function toPersistedCloudQueuedSend(
  queued: CloudQueuedSend,
): DeepMutable<typeof CloudQueuedSendSchema.Type> {
  return structuredClone(queued) as DeepMutable<typeof CloudQueuedSendSchema.Type>;
}

export function isCloudQueuedSendFailed(queued: CloudQueuedSend): boolean {
  return queued.failureMessage !== undefined;
}

/** The send gave up waiting for its project: the message is kept and can be resent. */
export function isProjectNotResolved(queued: CloudQueuedSend): boolean {
  return queued.failureKind === "project_not_resolved";
}
