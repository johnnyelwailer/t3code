/**
 * The Handle pattern (Epic 25 §The thread model) — the durable-suspension boundary the Thread
 * verbs are built on. A side-effect primitive splits into a `"sent"` entry (deterministic
 * `correlationId` of `"<runId>:<seq>"`, no result) and a `"resolved"` entry (keyed by that
 * `correlationId`, since the reply lands out of band). Two dispatch shapes share the machinery:
 *   • {@link HandleDispatch.send} — ask-shaped (`thread.turn` / `user.input`): journal the sent
 *     entry, fire the broker, return the `correlationId`; the body later `awaitResolution`s it.
 *   • {@link HandleDispatch.sendOneWay} — fire-and-forget (`thread.create` / `thread.message`):
 *     journal the sent entry SYNCHRONOUSLY (so seq alignment survives a later suspend), fire the
 *     broker best-effort, return the `correlationId` (the new thread's id). Never suspends.
 * Replay: a recorded sent entry is NOT re-fired; an ask whose resolved entry is present returns
 * the recorded reply, one whose entry is absent throws {@link WorkflowSuspended} (→ a
 * `SuspendedResult` the host resumes when the reply lands).
 */

import type { JournalSink } from "./journalStore.ts";
import type { JournalEntry, ResolvedEntry } from "./journalReader.ts";
import type { PrimitiveKind } from "./runtimeTypes.ts";

/** Settles a fired handle synchronously — the broker calls this when a reply is immediate. */
export interface ReplyResolver {
  /**
   * `provenance` names WHO answered when it was not the real host — a composed broker
   * (`createInterceptingBroker` in `@runbook/threads/broker`) passes its handler's `by` here so
   * the `resolved` journal entry records it (see {@link import("./handlesDispatch.ts")}'s
   * `recordResolved`). Absent (the mock broker, the real host broker) means the real host
   * answered; that absence must stay the default so an existing caller that never intercepts
   * anything sees no change in its journal.
   */
  resolve(reply: unknown, provenance?: { readonly by: string }): void;
  /** Terminal rejection — `.response` rejects and a later real reply is ignored. */
  reject(error?: unknown): void;
}

/** A handle "sent" call routed through the durable runtime's shared `seq` counter. */
export interface HandleSendCall {
  readonly kind: PrimitiveKind;
  readonly refId: string;
  /** Canonical-JSON args; hashed into the `sent` entry for drift detection. */
  readonly args: unknown;
  /** Fire the side effect (only on the live path). Receives the deterministic
   * `correlationId` and a resolver the broker may call to settle synchronously. */
  readonly fire: (correlationId: string, resolver: ReplyResolver) => Promise<void>;
}

/** The minimal seam the durable runtime exposes so handle journaling shares its `seq` seat. */
export interface HandleSeat {
  readonly runId: string;
  readonly filePath: string | undefined;
  readonly nowIso: () => string;
  readonly isBlackBoxed: () => boolean;
  /** Increment and return the shared `seq` counter (the position of the `sent` entry). */
  readonly takeSeq: () => number;
  readonly maxRecordedSeq: number;
  readonly recordedAt: (seq: number) => JournalEntry | undefined;
  readonly resolvedFor: (correlationId: string) => ResolvedEntry | undefined;
  readonly writer: JournalSink;
  /** Update the in-memory resolved map so the same run sees a synchronous resolution. */
  readonly setResolved: (entry: ResolvedEntry) => void;
}

export interface HandleDispatch {
  /** Journal (or replay) an ask-shaped `sent` entry and fire the side effect; returns the
   * correlationId. */
  send(call: HandleSendCall): Promise<string>;
  /** Journal (or replay) a one-way `sent` entry synchronously and fire the side effect
   * best-effort; returns the correlationId (used as the new thread's id for `thread.create`). */
  sendOneWay(call: HandleSendCall): string;
  /** Read the resolved reply for a correlationId, or throw {@link WorkflowSuspended}. */
  awaitResolution<R>(
    correlationId: string,
    decodeReply: ((reply: unknown) => Promise<R>) | undefined,
  ): Promise<R>;
}

/**
 * The internal signal a suspended `await` on an ask-shaped reply throws. NOT part of the
 * author error taxonomy (it does not extend {@link import("./errors.ts").WorkflowError})
 * so a body's `catch (e instanceof WorkflowError)` does not swallow it; the runner catches it
 * by identity and parks the run.
 */
export class WorkflowSuspended extends Error {
  readonly correlationId: string;
  constructor(correlationId: string) {
    super(`Workflow suspended awaiting reply for correlationId '${correlationId}'.`);
    this.name = "WorkflowSuspended";
    this.correlationId = correlationId;
  }
}

export { createHandleDispatch } from "./handlesDispatch.ts";
