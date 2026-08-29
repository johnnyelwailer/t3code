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
  /** Live lifecycle observations; handle sends emit primitive started/completed like other calls. */
  readonly events?: import("./events.ts").WorkflowEventSink | undefined;
  /** First-class abort: a live handle send throws before firing or journaling (see the dispatch). */
  readonly abortSignal?: AbortSignal | undefined;
  /** The run's sticky suspension record — see {@link SuspensionLatch}. */
  readonly suspension: SuspensionLatch;
}

export interface HandleDispatch {
  /**
   * Re-throw this run's armed suspension signal, if any — the caller-facing half of
   * {@link SuspensionLatch}. Optional ONLY because hand-built test dispatches predate it; the
   * dispatch {@link createHandleDispatch} builds always supplies it, and the run-boundary check
   * in `executeWorkflowRun` is the actual guarantee. This one exists so a host adapter can stop
   * a swallowing body EARLIER, before it decodes an output schema against a fabricated value.
   */
  assertNotSuspended?(): void;
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
 *
 * A bare `catch (e)` in a body catches it anyway — JavaScript has no uncatchable throw — and an
 * idiomatic `try { await agent(…) } catch { return fallback }` therefore USED to produce a
 * completed run carrying the fallback, for an ask that never answered. {@link SuspensionLatch}
 * is the answer to that: catching this object no longer buys the body anything.
 */
export class WorkflowSuspended extends Error {
  readonly correlationId: string;
  constructor(correlationId: string) {
    super(
      `Workflow suspended awaiting reply for correlationId '${correlationId}'. ` +
        `This is the engine's durable-suspension signal, not an error — do not catch it. ` +
        `The run parks here and resumes from the journal when the reply lands.`,
    );
    this.name = "WorkflowSuspended";
    this.correlationId = correlationId;
  }
}

/** What {@link SuspensionLatch.armed} reports about the suspension a run parked on. */
export interface ArmedSuspension {
  readonly correlationId: string;
  /**
   * True when the ask was fired inside a `parallel()`/`pipeline()` black box. Those calls are
   * deliberately NOT journaled, so their correlationId has no `sent` entry for a host to settle
   * — such a suspension is unresumable, and the run boundary turns it into a hard failure rather
   * than parking forever. (A host may avoid it entirely by settling composition asks live inside
   * `broker.send`, which is what t3code's server does.)
   */
  readonly blackBoxed: boolean;
  /** The very signal object thrown, so re-throwing keeps the original stack. */
  readonly signal: WorkflowSuspended;
}

/**
 * The run-scoped, one-shot record that a durable suspension was signalled — the mechanism that
 * makes suspension unswallowable by user code.
 *
 * The problem it solves: suspension travels as a thrown `Error` through the workflow body, so any
 * `catch` in author code (or in `parallel()`'s per-branch rejection handler) can absorb it and let
 * the body carry on to a confident, fabricated result. There is no way to throw uncatchably, so
 * instead the signal is made STICKY: once armed, every engine touchpoint (`send`, `sendOneWay`,
 * `awaitResolution`, every journaled primitive, every deterministic global) re-throws the SAME
 * object before doing any work, and the run boundary refuses to report `completed` while it is
 * armed. A body that swallows therefore cannot fire another side effect, cannot journal another
 * entry, and cannot finish the run — it can only run pure code until it returns, at which point
 * the run parks exactly where it should have.
 *
 * Determinism: the latch is a pure function of journal state (armed iff the body reached an ask
 * whose `resolved` entry is absent), so a replayed run arms it at exactly the same point. Because
 * the re-throw happens BEFORE `takeSeq`, a swallowed suspension consumes no sequence numbers and
 * fires no duplicate side effects — the resumed run lines up entry for entry.
 */
export interface SuspensionLatch {
  /**
   * Record the suspension and return the signal to throw. Idempotent and FIRST-WINS: the run
   * parks on the correlationId it reached first, so later arming attempts (a body that caught and
   * kept going) return the original signal rather than moving the parking spot.
   */
  readonly arm: (correlationId: string, blackBoxed: boolean) => WorkflowSuspended;
  /** Re-throw the armed signal, if any. Called at the top of every engine touchpoint. */
  readonly assertNotSuspended: () => void;
  readonly armed: () => ArmedSuspension | undefined;
}

export function createSuspensionLatch(): SuspensionLatch {
  let record: ArmedSuspension | undefined;
  return {
    arm: (correlationId, blackBoxed) => {
      if (record !== undefined) return record.signal;
      const signal = new WorkflowSuspended(correlationId);
      record = { correlationId, blackBoxed, signal };
      return signal;
    },
    assertNotSuspended: () => {
      if (record !== undefined) throw record.signal;
    },
    armed: () => record,
  };
}

export { createHandleDispatch } from "./handlesDispatch.ts";
