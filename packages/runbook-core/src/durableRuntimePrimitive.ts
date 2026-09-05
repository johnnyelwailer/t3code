import { canonicalJsonError, hashArgs } from "./canonicalJson.ts";
import { JournalSchemaError, JournalSerializeError, WorkflowAborted } from "./errors.ts";
import { emitSafe, type WorkflowEvent } from "./events.ts";
import { assertJournalMatch, gapDrift } from "./replayDrift.ts";
import type { DurablePrimitiveSeat, PrimitiveCall } from "./runtimeTypes.ts";

export type { DurablePrimitiveSeat } from "./runtimeTypes.ts";

export function createDurableCallPrimitive(seat: DurablePrimitiveSeat) {
  const decodeRecorded = async <R>(
    call: PrimitiveCall<R>,
    recorded: unknown,
    atSeq: number,
  ): Promise<R> => {
    if (call.decodeRecorded === undefined) return recorded as R;
    try {
      return await call.decodeRecorded(recorded);
    } catch (error) {
      throw new JournalSchemaError({
        seq: atSeq,
        kind: call.kind,
        refId: call.refId,
        cause: error,
      });
    }
  };

  // Live-path observations only: a replayed call returns the recorded result without emitting,
  // so a subscriber sees each real transition exactly once per process lifetime. Emission is
  // guarded: a throwing observer must not fail the primitive call itself.
  const emit = (
    type: "primitive.started" | "primitive.completed",
    seq: number,
    kind: string,
    refId: string,
  ): void => {
    if (seat.runId === undefined) return;
    const event: WorkflowEvent = {
      type,
      runId: seat.runId,
      seq,
      kind,
      refId,
      at: seat.nowIso(),
    };
    emitSafe(seat.events, event);
  };

  return async <R>(call: PrimitiveCall<R>): Promise<R> => {
    // Sticky suspension, checked before takeSeq so a swallowing body consumes no sequence number.
    seat.suspension.assertNotSuspended();
    if (seat.isBlackBoxed()) {
      const nested = await call.exec();
      seat.suspension.assertNotSuspended();
      return nested;
    }
    const currentSeq = seat.takeSeq();
    const argsHash = hashArgs(call.args);
    const isNever = call.replay === "never";
    const recorded = seat.journal.get(currentSeq);

    if (recorded !== undefined) {
      assertJournalMatch(currentSeq, recorded, call.kind, call.refId, argsHash, seat.filePath);
      if (isNever) return await call.exec();
      return await decodeRecorded(call, recorded.result, currentSeq);
    }

    if (currentSeq <= seat.maxRecordedSeq)
      gapDrift(currentSeq, call.kind, call.refId, seat.filePath);

    // First-class abort: live path only — a replayed call returns the recorded result above.
    if (seat.abortSignal?.aborted === true) throw new WorkflowAborted();

    emit("primitive.started", currentSeq, call.kind, call.refId);
    const result = await call.exec();
    // `exec` is where `parallel()`/`pipeline()` run their thunks, and their per-branch handlers
    // catch everything a branch throws. If a branch suspended, this result is fabricated (nulls
    // for the suspended branches) — refuse to journal it and let the signal reach the boundary.
    seat.suspension.assertNotSuspended();
    const startedAt = seat.nowIso();
    const endedAt = seat.nowIso();
    const callId = `${currentSeq}:${call.kind}:${call.refId}`;
    const baseEntry = { seq: currentSeq, callId, refId: call.refId, argsHash, startedAt, endedAt };

    if (isNever) {
      seat.writer.append({ ...baseEntry, kind: "script-never", result: undefined });
      // Correlate with primitive.started by the call's kind, not the journal kind.
      emit("primitive.completed", currentSeq, call.kind, call.refId);
      return result;
    }

    const serializeError = result === undefined ? undefined : canonicalJsonError(result);
    if (serializeError !== undefined) {
      throw new JournalSerializeError({
        seq: currentSeq,
        kind: call.kind,
        refId: call.refId,
        cause: serializeError,
      });
    }
    seat.writer.append({ ...baseEntry, kind: call.kind, result });
    emit("primitive.completed", currentSeq, call.kind, call.refId);
    return result;
  };
}

export function createDurableCallDeterministic(seat: DurablePrimitiveSeat) {
  return <R extends number | string>(kind: "now" | "random" | "uuid", exec: () => R): R => {
    seat.suspension.assertNotSuspended(); // a parked run journals no further entropy
    if (seat.isBlackBoxed()) return exec();
    const at = seat.takeSeq();
    const argsHash = hashArgs(null);
    const recorded = seat.journal.get(at);
    if (recorded !== undefined) {
      assertJournalMatch(at, recorded, kind, kind, argsHash, seat.filePath);
      return recorded.result as R;
    }
    if (at <= seat.maxRecordedSeq) gapDrift(at, kind, kind, seat.filePath);
    const result = exec();
    const ts = seat.nowIso();
    seat.writer.append({
      seq: at,
      callId: `${at}:${kind}:${kind}`,
      kind,
      refId: kind,
      argsHash,
      result,
      startedAt: ts,
      endedAt: ts,
    });
    return result;
  };
}
