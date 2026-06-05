/**
 * The Handle pattern (Epic 25 §The Handle pattern, 25.4) — the genuine durable-suspension
 * boundary. A side-effect primitive (ui.show / thread.send / child.spawn / user.ask /
 * user.notify) splits into TWO journal entries because the reply is a separate event that
 * may arrive after a suspend/resume:
 *
 *   • a `"sent"` entry — recorded when the primitive fires; carries a deterministic
 *     `correlationId` (`"<runId>:<seq>"`) and NO result.
 *   • a `"resolved"` entry — recorded when the reply settles, keyed by that `correlationId`
 *     (NOT by `seq`, because it lands out of band via the broker/host).
 *
 * Replay: sent + resolved present → return the recorded reply. Sent present, resolved
 * absent → the body's `await handle.response` throws {@link WorkflowSuspended}, which the
 * runner converts into a `SuspendedResult` ("park this run; resume when the reply lands").
 * Fire-and-forget handles (`Handle<never>`) record only a `sent` entry and never suspend.
 *
 * `correlationId` is derived from `"<runId>:<seq>"` of the `sent` entry, so replaying to the
 * same `await` re-derives the same id and finds (or re-waits on) the same resolved entry.
 */

import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import { CancelledError } from "./t3work-sdk.errors.ts";
import type { JournalEntry, ResolvedEntry } from "./t3work-sdk.journalReader.ts";
import type { JournalWriter } from "./t3work-sdk.journalWriter.ts";
import { assertJournalMatch, gapDrift } from "./t3work-sdk.replayDrift.ts";
import type { PrimitiveKind } from "./t3work-sdk.types.ts";

/** A typed handle on a fired side effect. Ask-shaped calls (a `responseSchema` was given)
 * expose `.response`; fire-and-forget calls are `Handle<never>` and have no `.response`. */
export type Handle<R> = [R] extends [never]
  ? { readonly id: string; dismiss(): Promise<void> }
  : { readonly id: string; dismiss(): Promise<void>; readonly response: Promise<R> };

/** A `ui.show` handle — a {@link Handle} plus `update(view)` to re-render the same surface. */
export type UiHandle<R> = Handle<R> & { update(view: unknown): Promise<void> };

/** Settles a fired handle synchronously — the broker calls this when a reply is immediate. */
export interface ReplyResolver {
  resolve(reply: unknown): void;
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
  readonly writer: JournalWriter;
  /** Update the in-memory resolved map so the same run sees a synchronous resolution. */
  readonly setResolved: (entry: ResolvedEntry) => void;
}

export interface HandleDispatch {
  /** Journal (or replay) a `sent` entry and fire the side effect; returns the correlationId. */
  send(call: HandleSendCall): Promise<string>;
  /** Read the resolved reply for a correlationId, or throw {@link WorkflowSuspended}. */
  awaitResolution<R>(
    correlationId: string,
    decodeReply: ((reply: unknown) => Promise<R>) | undefined,
  ): Promise<R>;
  /** Record a terminal dismissal so a later reply is ignored. */
  dismiss(correlationId: string, kind: PrimitiveKind, refId: string): Promise<void>;
}

/**
 * The internal signal a suspended `await handle.response` throws. NOT part of the author
 * error taxonomy (it does not extend {@link import("./t3work-sdk.errors.ts").WorkflowError})
 * so a body's `catch (e instanceof WorkflowError)` does not swallow it; the runner catches
 * it by identity and parks the run.
 */
export class WorkflowSuspended extends Error {
  readonly correlationId: string;
  constructor(correlationId: string) {
    super(`Workflow suspended awaiting reply for correlationId '${correlationId}'.`);
    this.name = "WorkflowSuspended";
    this.correlationId = correlationId;
  }
}

export function createHandleDispatch(seat: HandleSeat): HandleDispatch {
  const recordResolved = (
    correlationId: string,
    kind: PrimitiveKind,
    refId: string,
    settle: { readonly reply?: unknown; readonly dismissed?: boolean },
  ): void => {
    if (seat.resolvedFor(correlationId) !== undefined) return; // first write wins
    const ts = seat.nowIso();
    seat.writer.appendResolved({ correlationId, kind, refId, ...settle, startedAt: ts, endedAt: ts });
    seat.setResolved({
      correlationId,
      kind,
      refId,
      dismissed: settle.dismissed ?? false,
      reply: settle.reply,
    });
  };

  const makeResolver = (correlationId: string, kind: PrimitiveKind, refId: string): ReplyResolver => ({
    resolve: (reply) => recordResolved(correlationId, kind, refId, { reply }),
    reject: () => recordResolved(correlationId, kind, refId, { dismissed: true }),
  });

  const send = async (call: HandleSendCall): Promise<string> => {
    if (seat.isBlackBoxed()) {
      // Inside parallel/pipeline: no journaling/suspension (per-thunk journaling deferred).
      const id = `${seat.runId}:blackbox`;
      await call.fire(id, makeResolver(id, call.kind, call.refId));
      return id;
    }
    const currentSeq = seat.takeSeq();
    const correlationId = `${seat.runId}:${currentSeq}`;
    const argsHash = hashArgs(call.args);
    const recorded = seat.recordedAt(currentSeq);
    if (recorded !== undefined) {
      assertJournalMatch(currentSeq, recorded, call.kind, call.refId, argsHash, seat.filePath);
      // Replay: the side effect already fired — do NOT re-fire the broker.
      return recorded.correlationId ?? correlationId;
    }
    if (currentSeq <= seat.maxRecordedSeq) gapDrift(currentSeq, call.kind, call.refId, seat.filePath);
    await call.fire(correlationId, makeResolver(correlationId, call.kind, call.refId));
    const ts = seat.nowIso();
    seat.writer.append({
      seq: currentSeq,
      callId: `${currentSeq}:${call.kind}:${call.refId}`,
      kind: call.kind,
      refId: call.refId,
      argsHash,
      result: undefined,
      phase: "sent",
      correlationId,
      startedAt: ts,
      endedAt: ts,
    });
    return correlationId;
  };

  const awaitResolution = async <R>(
    correlationId: string,
    decodeReply: ((reply: unknown) => Promise<R>) | undefined,
  ): Promise<R> => {
    const resolved = seat.resolvedFor(correlationId);
    if (resolved === undefined) throw new WorkflowSuspended(correlationId);
    if (resolved.dismissed) {
      throw new CancelledError(
        `Handle '${correlationId}' was dismissed; its response will never settle.`,
      );
    }
    return (decodeReply === undefined ? resolved.reply : await decodeReply(resolved.reply)) as R;
  };

  const dismiss = async (correlationId: string, kind: PrimitiveKind, refId: string): Promise<void> => {
    recordResolved(correlationId, kind, refId, { dismissed: true });
  };

  return { send, awaitResolution, dismiss };
}

/** Build the typed {@link Handle}/{@link UiHandle} returned to the workflow body. */
export function makeHandle<R>(
  dispatch: HandleDispatch,
  correlationId: string,
  opts: {
    readonly kind: PrimitiveKind;
    readonly refId: string;
    readonly ask: boolean;
    readonly decodeReply?: (reply: unknown) => Promise<R>;
    readonly update?: (view: unknown) => Promise<void>;
  },
): Handle<R> {
  const handle: Record<string, unknown> = {
    id: correlationId,
    dismiss: () => dispatch.dismiss(correlationId, opts.kind, opts.refId),
  };
  if (opts.update !== undefined) handle["update"] = opts.update;
  if (opts.ask) {
    // Lazy getter: the suspend check fires only when the body actually awaits `.response`.
    Object.defineProperty(handle, "response", {
      enumerable: true,
      get: () => dispatch.awaitResolution<R>(correlationId, opts.decodeReply),
    });
  }
  return handle as Handle<R>;
}
