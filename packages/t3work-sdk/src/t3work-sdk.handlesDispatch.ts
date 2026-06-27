import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import { CancelledError } from "./t3work-sdk.errors.ts";
import type { PrimitiveKind } from "./t3work-sdk.types.ts";
import {
  type HandleDispatch,
  type HandleSeat,
  type HandleSendCall,
  type ReplyResolver,
  WorkflowSuspended,
} from "./t3work-sdk.handles.ts";
import { assertJournalMatch, gapDrift } from "./t3work-sdk.replayDrift.ts";

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
    settle: { readonly reply?: unknown; readonly dismissed?: boolean },
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
    });
  };

  const makeResolver = (
    correlationId: string,
    kind: PrimitiveKind,
    refId: string,
  ): ReplyResolver => ({
    resolve: (reply) => recordResolved(correlationId, kind, refId, { reply }),
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
    if (seat.isBlackBoxed()) {
      const id = `${seat.runId}:blackbox:${(blackboxSeq += 1)}`;
      await call.fire(id, inMemoryResolver(id, call.kind, call.refId));
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
    if (currentSeq <= seat.maxRecordedSeq)
      gapDrift(currentSeq, call.kind, call.refId, seat.filePath);
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

  const sendOneWay = (call: HandleSendCall): string => {
    if (seat.isBlackBoxed()) {
      const id = `${seat.runId}:blackbox:${(blackboxSeq += 1)}`;
      void call.fire(id, noopResolver);
      return id;
    }
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
    // Journal the sent entry SYNCHRONOUSLY (writeSync) before firing, so a suspend on a later
    // await cannot dispose the writer mid-append. Delivery is best-effort, fired floating.
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
    void call.fire(correlationId, noopResolver);
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

  return { send, sendOneWay, awaitResolution };
}
