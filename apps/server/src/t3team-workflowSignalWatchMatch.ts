/**
 * Which parked signal wait an event answers — the ONE matching rule shared by the delivery port,
 * the park-inbox drain and the broker's live drain, for both park shapes a `watching` row has:
 *
 *   • single (`signal.wait`): the `watch_*` columns name one (instance, signal, key); the reply is
 *     the payload itself.
 *   • any-wait (`signal.waitAny`): `watch_any_json` lists every branch in branch order (the
 *     `watch_*` columns repeat branch 0 for status readers); the reply is the `{ index, reply }`
 *     winner envelope for the FIRST branch the event matches. Journaled once, first write wins, it
 *     is what every replay of the run reads back (`@runbook/core/handlesAny`).
 *
 * Matching always reads the row's CURRENT park: an event for a branch the run has stopped waiting
 * on (it lost an earlier any-wait, or the run moved on) matches nothing here and is bridged to the
 * inbox for the run's next wait, instead of answering a correlation that is already settled.
 */
import { anyWinner } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkflowRun } from "./persistence/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/WorkflowSignalStore.ts";
import type { SignalWaitPayload } from "./t3team-workflowEngineBrokerPayloads.ts";

/** One awaited (instance, signal, key): the join key of the inbox and of delivery. */
export interface SignalTuple {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly signalName: string;
  readonly key: string;
}

/** A parked correlation and the reply that answers it. */
export interface SignalWatchAnswer {
  readonly correlationId: string;
  readonly reply: unknown;
}

/** A branch as the store joins on it (a branch has the wire shape of a `signal.wait` payload). */
export const tupleOfBranch = (branch: SignalWaitPayload): SignalTuple => ({
  sourceName: branch.source,
  paramsHash: branch.paramsHash,
  signalName: branch.signal,
  key: branch.key,
});

const sameTuple = (a: SignalTuple, b: SignalTuple): boolean =>
  a.sourceName === b.sourceName &&
  a.paramsHash === b.paramsHash &&
  a.signalName === b.signalName &&
  a.key === b.key;

/** Index of the first branch `tuple` matches, or -1. */
const branchIndexOf = (tuples: ReadonlyArray<SignalTuple>, tuple: SignalTuple): number =>
  tuples.findIndex((candidate) => sameTuple(candidate, tuple));

/** True for a `waitForAny` park (a branch list), false for a single `signal.wait` park. */
export const isAnyWait = (run: WorkflowRun): boolean =>
  run.watchAny != null && run.watchAny.length > 0;

/** Every tuple the row's park waits on, in branch order; `undefined` for an incomplete park. */
export function parkedTuples(run: WorkflowRun): ReadonlyArray<SignalTuple> | undefined {
  if (isAnyWait(run)) return run.watchAny!.map(tupleOfBranch);
  if (
    run.watchSourceName == null ||
    run.watchParamsHash == null ||
    run.watchSignalName == null ||
    run.watchSignalKey == null
  ) {
    return undefined;
  }
  return [
    {
      sourceName: run.watchSourceName,
      paramsHash: run.watchParamsHash,
      signalName: run.watchSignalName,
      key: run.watchSignalKey,
    },
  ];
}

/** The reply that answers the park branch `index` of `run` with `payload`. */
export const replyForBranch = (run: WorkflowRun, index: number, payload: unknown): unknown =>
  isAnyWait(run) ? anyWinner(index, payload) : payload;

/** The any-wait drain: take the OLDEST open inbox entry across `tuples` (the event that landed
 * first, whichever branch it is on) and say which branch it answers. */
export const takeFirstBranchEntry = (
  store: Pick<WorkflowSignalStoreShape, "takeFirstOpenInboxEntry">,
  tuples: ReadonlyArray<SignalTuple>,
  deliveredAt: string,
) =>
  store.takeFirstOpenInboxEntry({ tuples, deliveredAt }).pipe(
    Effect.map(
      Option.flatMap((entry) => {
        const index = branchIndexOf(tuples, entry);
        return index < 0 ? Option.none() : Option.some({ index, payload: entry.payload });
      }),
    ),
  );

/** The answer an event on `tuple` gives the park recorded on `run`, or `undefined` when that park
 * does not wait on the tuple (or the row is incomplete). The caller vouches that `run` is a
 * `watching` row: listed by that status, or re-read and checked. */
export function answerParkedWatch(
  run: WorkflowRun,
  tuple: SignalTuple,
  payload: unknown,
): SignalWatchAnswer | undefined {
  if (run.pendingCorrelationId == null) return undefined;
  const index = branchIndexOf(parkedTuples(run) ?? [], tuple);
  if (index < 0) return undefined;
  return { correlationId: run.pendingCorrelationId, reply: replyForBranch(run, index, payload) };
}
