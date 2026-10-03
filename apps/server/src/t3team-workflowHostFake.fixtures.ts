/**
 * A recording stand-in for the workflow host (`WorkflowHostPort`) for engine tests that do not
 * need a real orchestrator: every operation is recorded and succeeds (or fails, when `failOn`
 * names it). Tests assert on what the run asked the host to do.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  T3TeamWorkflowHost,
  T3TeamWorkflowHostError,
  type T3TeamWorkflowHostShape,
} from "./t3team-workflowHost.ts";
import type {
  WorkflowHostActivityInput,
  WorkflowHostMessageInput,
  WorkflowHostPort,
  WorkflowHostStartTurnInput,
} from "./t3team-workflowHostPort.ts";

export type FakeWorkflowHostCall = {
  readonly [K in keyof WorkflowHostPort]: {
    readonly op: K;
    readonly input: Parameters<WorkflowHostPort[K]>[0];
  };
}[keyof WorkflowHostPort];

export function makeFakeWorkflowHost(options: { readonly failOn?: keyof WorkflowHostPort } = {}) {
  const calls: FakeWorkflowHostCall[] = [];
  const record =
    <K extends keyof WorkflowHostPort>(op: K) =>
    async (input: Parameters<WorkflowHostPort[K]>[0]): Promise<void> => {
      calls.push({ op, input } as FakeWorkflowHostCall);
      if (options.failOn === op) throw new Error(`host ${op} failed`);
    };
  const host: WorkflowHostPort = {
    createThread: record("createThread"),
    startTurn: record("startTurn"),
    postMessage: record("postMessage"),
    upsertActivity: record("upsertActivity"),
    interrupt: record("interrupt"),
    syncRunFacts: record("syncRunFacts"),
  };
  const inputsOf = <K extends keyof WorkflowHostPort>(op: K) =>
    calls.flatMap((call) =>
      call.op === op ? [call.input as Parameters<WorkflowHostPort[K]>[0]] : [],
    );
  return {
    host,
    calls,
    ops: () => calls.map((call) => call.op),
    messages: (): WorkflowHostMessageInput[] => inputsOf("postMessage"),
    turns: (): WorkflowHostStartTurnInput[] => inputsOf("startTurn"),
    activities: (): WorkflowHostActivityInput[] => inputsOf("upsertActivity"),
  };
}

/**
 * The same recording fake as a `T3TeamWorkflowHost` service layer, for layers that resolve the
 * host from context (boot rehydration, the scheduler). Held notes are never held: `flushHeld` is
 * a no-op and nothing is ever pending.
 */
export function makeFakeWorkflowHostLayer(
  options: { readonly failOn?: keyof WorkflowHostPort } = {},
) {
  const fake = makeFakeWorkflowHost(options);
  const lift =
    <K extends keyof WorkflowHostPort>(op: K) =>
    (input: Parameters<WorkflowHostPort[K]>[0]) =>
      Effect.tryPromise({
        try: () => (fake.host[op] as (value: typeof input) => Promise<void>)(input),
        catch: (cause) => new T3TeamWorkflowHostError({ operation: op, message: String(cause) }),
      });
  const service: T3TeamWorkflowHostShape = {
    createThread: lift("createThread"),
    startTurn: lift("startTurn"),
    postMessage: lift("postMessage"),
    upsertActivity: lift("upsertActivity"),
    interrupt: lift("interrupt"),
    syncRunFacts: lift("syncRunFacts"),
    flushHeld: () => Effect.void,
    heldThreadIds: () => [],
  };
  return { ...fake, layer: Layer.succeed(T3TeamWorkflowHost, service) };
}
