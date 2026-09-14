import { hashArgs } from "./canonicalJson.ts";
import { CancelledError, WorkflowAborted } from "./errors.ts";
import { emitSafe } from "./events.ts";
import type { PrimitiveKind } from "./runtimeTypes.ts";
import type { HandleDispatch, HandleSeat, HandleSendCall, ReplyResolver } from "./handles.ts";
import { assertJournalMatch, gapDrift } from "./replayDrift.ts";

const noopResolver: ReplyResolver = { resolve: () => {}, reject: () => {} };

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

  const send = async (call: HandleSendCall): Promise<string> => {
    // Sticky suspension, checked FIRST — before the black-box branch, before the abort check, and
    // above all before takeSeq: a body that caught the signal and looped must not consume another
    // seq or fire another side effect. See SuspensionLatch in handles.ts.
    seat.suspension.assertNotSuspended();
    if (seat.isBlackBoxed()) {
      const id = `${seat.runId}:blackbox:${(blackboxSeq += 1)}`;
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
      assertJournalMatch(currentSeq, recorded, call.kind, call.refId, argsHash, seat.filePath);
      // Replay: the side effect already fired — do NOT re-fire the broker.
      return recorded.correlationId ?? correlationId;
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
    // idempotent broker dedupes. Core never re-fires a recorded sent entry on replay.
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
    await call.fire(correlationId, makeResolver(correlationId, call.kind, call.refId));
    // A broker may itself have driven a nested body that suspended (an intercepting broker does);
    // refuse to hand this correlationId back once the run is parked.
    seat.suspension.assertNotSuspended();
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
      return recorded.correlationId ?? correlationId; // replay: do NOT re-fire
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
