/**
 * A recording stand-in for the workflow host (`WorkflowHostPort`) for engine tests that do not
 * need a real orchestrator: every operation is recorded and succeeds (or fails, when `failOn`
 * names it). Tests assert on what the run asked the host to do.
 */
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
