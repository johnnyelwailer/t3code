import { hashArgs } from "./canonicalJson.ts";
import { CancelledError, WorkflowAborted, WorkflowError } from "./errors.ts";
import { emitSafe } from "./events.ts";
import type { PrimitiveKind } from "./runtimeTypes.ts";
import type {
  FireDelivery,
  HandleDispatch,
  HandleSeat,
  HandleSendCall,
  ReplyResolver,
} from "./handles.ts";
import { assertJournalMatch, gapDrift } from "./replayDrift.ts";

const noopResolver: ReplyResolver = { resolve: () => {}, reject: () => {} };

/**
 * The only journal kinds a `RefireTarget` may name: the model/user asks, whose fire is a pure
 * re-send of the payload. Every other resolvable kind's fire has a side effect of its own that a
 * second call would duplicate (`wait.until` re-schedules, `signal.wait` re-registers,
 * `model.resolve` settles itself), and one-way sends never await a reply. Same vocabulary as
 * `checkpoint.ts`'s `RESOLVABLE_SENT_KINDS`.
 */
export const REFIRABLE_ASK_KINDS: ReadonlySet<string> = new Set(["thread.turn", "user.input"]);

export function createHandleDispatch(seat: HandleSeat): HandleDispatch {
  // Unique synthetic ids for black-boxed sends (inside parallel/pipeline). These execute live
  // and are never journaled/replayed, so the counter only has to stay unique within one run —
  // a shared `"<runId>:blackbox"` id would collide across concurrent thunks (first-write-wins
  // on the resolved map would hand one thunk another's reply).
  let blackboxSeq = 0;

  const recordResolved = (
    correlationId: string,
    kind: PrimitiveKind,
    refId: string,
    // `by` is provenance (Epic: sub-workflow effect interception) — set only when a composed
    // broker's handler settled this reply instead of the real host. Absent is the default and
    // must stay indistinguishable from "no provenance support existed": a real host's synchronous
    // resolve (the mock broker, `createHostBroker`'s `model.resolve`) never passes it.
    settle: { readonly reply?: unknown; readonly dismissed?: boolean; readonly by?: string },
  ): void => {
    if (seat.resolvedFor(correlationId) !== undefined) return; // first write wins
    const ts = seat.nowIso();
    seat.writer.appendResolved({
      correlationId,
      kind,
      refId,
      ...settle,
      startedAt: ts,
      endedAt: ts,
    });
    seat.setResolved({
      correlationId,
      kind,
      refId,
      dismissed: settle.dismissed ?? false,
      reply: settle.reply,
      ...(settle.by === undefined ? {} : { by: settle.by }),
      startedAt: ts, // the journaled line's own time, so this run and its replay agree
    });
  };

  const makeResolver = (
    correlationId: string,
    kind: PrimitiveKind,
    refId: string,
  ): ReplyResolver => ({
    resolve: (reply, provenance) =>
      recordResolved(
        correlationId,
        kind,
        refId,
        provenance?.by === undefined ? { reply } : { reply, by: provenance.by },
      ),
    reject: () => recordResolved(correlationId, kind, refId, { dismissed: true }),
  });

  // A resolver for a black-boxed send: settles the IN-MEMORY map only, never the journal —
  // the enclosing parallel/pipeline entry is the journal boundary, so a nested ask's reply
  // must not occupy a journal line of its own.
  const inMemoryResolver = (
    correlationId: string,
    kind: PrimitiveKind,
    refId: string,
  ): ReplyResolver => ({
    resolve: (reply) => seat.setResolved({ correlationId, kind, refId, dismissed: false, reply }),
    reject: () =>
      seat.setResolved({ correlationId, kind, refId, dismissed: true, reply: undefined }),
  });

  /** True iff `correlationId` is the run's still-pending opt-in re-fire (see RefireTarget). */
  const isRefireTarget = (correlationId: string): boolean =>
    seat.refire !== undefined &&
    !seat.refire.consumed() &&
    seat.refire.correlationId === correlationId;

  const refireRefused = (correlationId: string, why: string): WorkflowError =>
    new WorkflowError(`Cannot re-fire ask '${correlationId}': ${why}`);

  /** Fire a journaled ask and observe it — shared by the live path and the re-fire. */
  const fireObserved = async (
    atSeq: number,
    correlationId: string,
    call: HandleSendCall,
    delivery?: FireDelivery,
  ): Promise<void> => {
    const resolver = makeResolver(correlationId, call.kind, call.refId);
    await (delivery === undefined
      ? call.fire(correlationId, resolver)
      : call.fire(correlationId, resolver, delivery));
    // A broker may itself have driven a nested body that suspended (an intercepting broker does);
    // refuse to hand this correlationId back once the run is parked.
    seat.suspension.assertNotSuspended();
    emitSafe(seat.events, {
      type: "primitive.completed",
      runId: seat.runId,
      seq: atSeq,
      kind: call.kind,
      refId: call.refId,
      at: seat.nowIso(),
    });
  };

  /**
   * The opt-in re-fire of a recorded ask: same seq, same correlationId, payload proven identical
   * by the caller's `assertJournalMatch`. NOTHING is journaled here — the original `sent` entry
   * stays the ask's only intent line, and the resolver writes the `resolved` entry when (if) the
   * reply lands, so a crash before the reply leaves the ask open for another re-fire.
   */
  const refireRecorded = async (
    atSeq: number,
    correlationId: string,
    call: HandleSendCall,
  ): Promise<string> => {
    if (!REFIRABLE_ASK_KINDS.has(call.kind)) {
      throw refireRefused(correlationId, `'${call.kind}' is not a re-sendable ask kind.`);
    }
    if (seat.resolvedFor(correlationId) !== undefined) {
      throw refireRefused(correlationId, "it already has a journaled reply; replay it instead.");
    }
    seat.refire?.consume();
    emitSafe(seat.events, {
      type: "primitive.started",
      runId: seat.runId,
      seq: atSeq,
      kind: call.kind,
      refId: call.refId,
      at: seat.nowIso(),
    });
    await fireObserved(atSeq, correlationId, call, { redelivery: true });
    return correlationId;
  };

  const send = async (call: HandleSendCall): Promise<string> => {
    // Sticky suspension, checked FIRST — before the black-box branch, before the abort check, and
    // above all before takeSeq: a body that caught the signal and looped must not consume another
    // seq or fire another side effect. See SuspensionLatch in handles.ts.
    seat.suspension.assertNotSuspended();
    if (seat.isBlackBoxed()) {
      const id = `${seat.runId}:blackbox:${(blackboxSeq += 1)}`;
      if (isRefireTarget(id)) {
        throw refireRefused(
          id,
          "it was sent inside parallel()/pipeline(), which never journals its sends — the branch re-runs live on resume.",
        );
      }
      await call.fire(id, inMemoryResolver(id, call.kind, call.refId));
      return id;
    }
    // First-class abort: live path only, checked BEFORE takeSeq — a pre-aborted run must leave
    // fire=0, seq=0: no seq consumed, no journal entry, no broker fire.
    if (seat.abortSignal?.aborted === true) throw new WorkflowAborted();
    const currentSeq = seat.takeSeq();
    const correlationId = `${seat.runId}:${currentSeq}`;
    const argsHash = hashArgs(call.args);
    const recorded = seat.recordedAt(currentSeq);
    if (recorded !== undefined) {
      // The hash check stays exactly as on every replay: for a re-fire it is what proves the
      // payload handed to the broker again is byte-identical to the one first sent. The one
      // exception is a `legacyArgs` match (a pre-rewording journal): it replays, and a re-fire of
      // it sends the current wording of the same ask.
      const legacyMatch =
        recorded.argsHash !== argsHash &&
        call.legacyArgs?.some((legacy) => hashArgs(legacy) === recorded.argsHash) === true;
      assertJournalMatch(
        currentSeq,
        recorded,
        call.kind,
        call.refId,
        legacyMatch ? recorded.argsHash : argsHash,
        seat.filePath,
      );
      const recordedId = recorded.correlationId ?? correlationId;
      // Replay: the side effect already fired — do NOT re-fire the broker, unless the host named
      // this very ask as the run's one-shot re-fire target.
      if (!isRefireTarget(recordedId)) return recordedId;
      return await refireRecorded(currentSeq, recordedId, call);
    }
    if (currentSeq <= seat.maxRecordedSeq)
      gapDrift(currentSeq, call.kind, call.refId, seat.filePath);
    emitSafe(seat.events, {
      type: "primitive.started",
      runId: seat.runId,
      seq: currentSeq,
      kind: call.kind,
      refId: call.refId,
      at: seat.nowIso(),
    });
    // Journal the durable dispatch intent (stable correlationId) BEFORE firing: a crash between
    // intent and fire leaves a pending correlation the host retries with the SAME id, and the
    // idempotent broker dedupes. Core never re-fires a recorded sent entry on replay, except the
    // host's explicit one-shot RefireTarget — and that fire carries `redelivery: true`.
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
    await fireObserved(currentSeq, correlationId, call);
    return correlationId;
  };

  const sendOneWay = (call: HandleSendCall): string => {
    seat.suspension.assertNotSuspended(); // see `send` — no seq, no fire, once the run is parked
    if (seat.isBlackBoxed()) {
      const id = `${seat.runId}:blackbox:${(blackboxSeq += 1)}`;
      void call.fire(id, noopResolver);
      return id;
    }
    // First-class abort: live path only, checked BEFORE takeSeq — fire=0, seq=0 on abort.
    if (seat.abortSignal?.aborted === true) throw new WorkflowAborted();
    const currentSeq = seat.takeSeq();
    const correlationId = `${seat.runId}:${currentSeq}`;
    const argsHash = hashArgs(call.args);
    const recorded = seat.recordedAt(currentSeq);
    if (recorded !== undefined) {
      assertJournalMatch(currentSeq, recorded, call.kind, call.refId, argsHash, seat.filePath);
      const recordedId = recorded.correlationId ?? correlationId;
      if (isRefireTarget(recordedId)) {
        throw refireRefused(recordedId, "it is a one-way send, which never awaits a reply.");
      }
      return recordedId; // replay: do NOT re-fire
    }
    if (currentSeq <= seat.maxRecordedSeq)
      gapDrift(currentSeq, call.kind, call.refId, seat.filePath);
    // Journal the durable dispatch intent (stable correlationId) SYNCHRONOUSLY before firing, so
    // a suspend on a later await cannot dispose the writer mid-append and a crash between intent
    // and fire leaves a pending correlation for the host to retry with the SAME id. Delivery is
    // best-effort, fired floating.
    const ts = seat.nowIso();
    emitSafe(seat.events, {
      type: "primitive.started",
      runId: seat.runId,
      seq: currentSeq,
      kind: call.kind,
      refId: call.refId,
      at: ts,
    });
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
    void call.fire(correlationId, noopResolver);
    emitSafe(seat.events, {
      type: "primitive.completed",
      runId: seat.runId,
      seq: currentSeq,
      kind: call.kind,
      refId: call.refId,
      at: seat.nowIso(),
    });
    return correlationId;
  };

  const awaitResolution = async <R>(
    correlationId: string,
    decodeReply: ((reply: unknown) => Promise<R>) | undefined,
  ): Promise<R> => {
    // Deliberately NOT gated on `assertNotSuspended`: reading an ALREADY-journaled reply is a pure
    // read that fires nothing and writes nothing, so re-throwing here would buy no safety while
    // breaking a host that settles a resolver out of band and reads it back on the same runtime.
    // Every touchpoint that could actually do damage — send, sendOneWay, callPrimitive, the
    // deterministic globals, and the run boundary — is gated.
    const resolved = seat.resolvedFor(correlationId);
    // Arm the latch instead of throwing a fresh signal: user code may catch this, and the latch is
    // what makes catching it worthless. `isBlackBoxed` rides along because a suspension inside
    // parallel()/pipeline() has no journaled `sent` entry and can never be resumed.
    if (resolved === undefined) throw seat.suspension.arm(correlationId, seat.isBlackBoxed());
    if (resolved.dismissed) {
      throw new CancelledError(
        `Handle '${correlationId}' was dismissed; its response will never settle.`,
      );
    }
    return (decodeReply === undefined ? resolved.reply : await decodeReply(resolved.reply)) as R;
  };

  return {
    assertNotSuspended: seat.suspension.assertNotSuspended,
    send,
    sendOneWay,
    awaitResolution,
  };
}
