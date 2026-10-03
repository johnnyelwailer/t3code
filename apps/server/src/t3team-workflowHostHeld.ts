/**
 * Notes a workflow posts with `afterActiveRun` (`T3TeamWorkflowHost.postMessage`): while the
 * thread has an active run the note is HELD and posted when that run ends, so it lands after the
 * run instead of buried inside it (a run's terminal notice posted mid-turn sat unseen for 40
 * minutes in a live incident). The workflow reactor flushes a thread when one of its runs ends;
 * its durable sweep re-flushes every thread still holding notes.
 *
 * In-memory: a note held across a restart is lost with the run that was mid-flight.
 */
import * as Effect from "effect/Effect";

import type { WorkflowHostMessageInput } from "./t3team-workflowHostPort.ts";

export function makeHeldWorkflowMessages<ReadError, WriteError>(deps: {
  readonly hasActiveRun: (threadId: string) => Effect.Effect<boolean, ReadError>;
  readonly write: (input: WorkflowHostMessageInput) => Effect.Effect<void, WriteError>;
}) {
  const held = new Map<string, Map<string, WorkflowHostMessageInput>>();

  /** Post now, or hold until the thread's active run ends. */
  const post = (input: WorkflowHostMessageInput) =>
    Effect.gen(function* () {
      if (input.afterActiveRun === true && (yield* deps.hasActiveRun(input.threadId))) {
        const thread = held.get(input.threadId) ?? new Map<string, WorkflowHostMessageInput>();
        thread.set(input.messageId, input);
        held.set(input.threadId, thread);
        return;
      }
      // A later post of the same message supersedes a held one.
      held.get(input.threadId)?.delete(input.messageId);
      yield* deps.write(input);
    });

  /** Post a thread's held messages once it has no active run. */
  const flush = (threadId: string) =>
    Effect.gen(function* () {
      const thread = held.get(threadId);
      if (thread === undefined || (yield* deps.hasActiveRun(threadId))) return;
      held.delete(threadId);
      yield* Effect.forEach(thread.values(), deps.write, { discard: true });
    });

  return { post, flush, heldThreadIds: () => [...held.keys()] };
}
