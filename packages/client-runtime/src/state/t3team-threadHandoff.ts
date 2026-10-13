/**
 * "Move to" another machine: continue a started thread as a successor thread on the target
 * environment (see `t3team-threadHandoff` in contracts). Host-neutral: the steps are injected,
 * so web and mobile drive the same order and tests can observe it.
 *
 * Order invariant — the source is only touched once the successor is confirmed live:
 *   1. capture (source, read-only; "wait" mode lets the active turn end first)
 *   2. launch the successor (target) with the continuation envelope as its first message
 *   3. verify the successor's first run is live (target)
 *   4. settle: interrupt the source's active run, record both link facts, reap the source
 * A failure in 1–3 leaves the source exactly as it was. A failed verify also stops the
 * successor when it can, since a late-starting one plus a retry would put two agents on the
 * same work. A failure in 4 is a warning: the successor already runs, so nothing is rolled back.
 */
import {
  type EnvironmentId,
  type RunId,
  type T3TeamEnvironmentCapabilities,
  type T3TeamThreadHandoffCapture,
  type T3TeamThreadHandoffRecordInput,
  type T3TeamThreadHandoffRefusal,
  type ThreadId,
  WS_METHODS,
} from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";
import {
  continuationEnvelope,
  successorWorkspace,
  type ThreadHandoffWorkspace,
} from "./t3team-threadHandoffSuccessor.ts";

export {
  continuationEnvelope,
  successorRunState,
  successorWorkspace,
  type ThreadHandoffWorkspace,
} from "./t3team-threadHandoffSuccessor.ts";

export const supportsT3TeamThreadHandoff = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
): boolean => capabilities?.threadHandoff === true;

export function createT3TeamThreadHandoffCommands<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    prepare: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:t3team:thread-handoff:prepare",
      tag: WS_METHODS.t3teamThreadHandoffPrepare,
    }),
    record: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:t3team:thread-handoff:record",
      tag: WS_METHODS.t3teamThreadHandoffRecord,
    }),
  };
}

/** Stop the turn and move now (default), or move once the active turn has ended. */
export type ThreadHandoffTurnMode = "interrupt" | "wait";

export interface ThreadHandoffEndpoint {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly label: string;
}

export interface ThreadHandoffSteps {
  readonly capture: (input: {
    readonly waitForTurnEnd: boolean;
  }) => Promise<T3TeamThreadHandoffCapture>;
  readonly launchSuccessor: (input: {
    readonly capture: T3TeamThreadHandoffCapture;
    readonly workspace: ThreadHandoffWorkspace;
    readonly text: string;
  }) => Promise<void>;
  /** Resolves once the successor's first run is observed live; rejects on failure or timeout. */
  readonly awaitSuccessorLive: () => Promise<void>;
  /**
   * Best-effort stop of a successor that failed verification; resolves `true` once nothing of
   * it can still start. Absent or `false` = it may still come up.
   */
  readonly stopSuccessor?: () => Promise<boolean>;
  readonly interruptSource: (runId: RunId) => Promise<void>;
  readonly record: (
    environmentId: EnvironmentId,
    input: T3TeamThreadHandoffRecordInput,
  ) => Promise<void>;
  /** Frees the source's agent process tree; optional where the host has no cleanup. */
  readonly reapSource?: () => Promise<void>;
}

export type ThreadHandoffOutcome =
  | { readonly type: "refused"; readonly refusals: ReadonlyArray<T3TeamThreadHandoffRefusal> }
  | {
      readonly type: "failed";
      readonly stage: "capture" | "launch";
      readonly message: string;
    }
  | {
      readonly type: "failed";
      readonly stage: "verify";
      readonly message: string;
      /** False when the successor may still start: retrying then could launch it twice. */
      readonly successorStopped: boolean;
    }
  | { readonly type: "moved"; readonly warnings: ReadonlyArray<string> };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runThreadHandoff(input: {
  readonly source: ThreadHandoffEndpoint;
  readonly successor: ThreadHandoffEndpoint;
  readonly turnMode: ThreadHandoffTurnMode;
  readonly steps: ThreadHandoffSteps;
}): Promise<ThreadHandoffOutcome> {
  const { source, successor, steps } = input;
  let capture: T3TeamThreadHandoffCapture;
  try {
    capture = await steps.capture({ waitForTurnEnd: input.turnMode === "wait" });
  } catch (error) {
    return { type: "failed", stage: "capture", message: messageOf(error) };
  }
  if (capture.refusals.length > 0) return { type: "refused", refusals: capture.refusals };

  const interrupted = capture.activeRunId !== null;
  try {
    await steps.launchSuccessor({
      capture,
      workspace: successorWorkspace(capture),
      text: continuationEnvelope({ capture, source, interrupted }),
    });
  } catch (error) {
    return { type: "failed", stage: "launch", message: messageOf(error) };
  }
  try {
    await steps.awaitSuccessorLive();
  } catch (error) {
    const successorStopped = steps.stopSuccessor
      ? await steps.stopSuccessor().catch(() => false)
      : false;
    return { type: "failed", stage: "verify", message: messageOf(error), successorStopped };
  }

  // The successor runs: from here on, nothing is rolled back.
  const warnings: string[] = [];
  const settle = async (what: string, step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      warnings.push(`${what}: ${messageOf(error)}`);
    }
  };
  if (capture.activeRunId !== null) {
    const runId = capture.activeRunId;
    await settle("Stopping the original turn", () => steps.interruptSource(runId));
  }
  await settle("Marking the original thread as moved", () =>
    steps.record(source.environmentId, {
      threadId: source.threadId,
      direction: "moved_to",
      peerEnvironmentId: successor.environmentId,
      peerThreadId: successor.threadId,
      peerLabel: successor.label,
    }),
  );
  await settle("Linking the new thread back", () =>
    steps.record(successor.environmentId, {
      threadId: successor.threadId,
      direction: "moved_from",
      peerEnvironmentId: source.environmentId,
      peerThreadId: source.threadId,
      peerLabel: source.label,
    }),
  );
  if (steps.reapSource !== undefined) {
    await settle("Freeing the original machine", steps.reapSource);
  }
  return { type: "moved", warnings };
}
