// @effect-diagnostics nodeBuiltinImport:off - the journal helpers read a temp run journal from disk.
/** Shared real-broker harness for child-spawn and durable refusal tests. */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { buildJournalMaps, type JournalMaps } from "@t3team/sdk";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import type { WorkflowEngineBrokerDeps } from "./t3team-workflowEngineBrokerTypes.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import type {
  WorkflowStepActivityEmitter,
  WorkflowStepSentInput,
} from "./t3team-workflowEngineStepActivities.ts";
import type {
  WorkflowHostCreateThreadInput,
  WorkflowHostMessageInput,
  WorkflowHostPort,
  WorkflowHostStartTurnInput,
} from "./t3team-workflowHostPort.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

/** The launch thread every child-spawn harness parents its children under. */
export const CHILD_SPAWN_LAUNCH_THREAD_ID = "launch-1";

/** The host's real refusal message for a launch checkout that cannot be inherited. */
export const MISSING_LAUNCH_CHECKOUT =
  "Cannot inherit the checkout of launch thread launch-1: not found.";

/**
 * A host that records creates and refuses the first `remainingFailures` of them with `refusal`.
 * The refusal is the host's OWN error object: the contract says the body sees that exact object.
 */
export function makeRefusingWorkflowHost(refusal: unknown, remainingFailures = 1) {
  const fake = makeFakeWorkflowHost();
  const attempts: WorkflowHostCreateThreadInput[] = [];
  const created: WorkflowHostCreateThreadInput[] = [];
  const turns: WorkflowHostStartTurnInput[] = [];
  let left = remainingFailures;
  const host: WorkflowHostPort = {
    ...fake.host,
    createThread: async (input) => {
      attempts.push(input);
      if (left > 0) {
        left -= 1;
        throw refusal;
      }
      created.push(input);
    },
    startTurn: async (input) => {
      turns.push(input);
    },
  };
  return {
    host,
    attempts,
    created,
    turns,
    messages: (): WorkflowHostMessageInput[] => fake.messages(),
  };
}

/**
 * The REAL broker, wired to the real registry, with its step activities recorded. The overrides
 * land LAST, so a caller can retarget the run (`runId`) or add host hooks (`beforePrimitive`).
 */
export function makeChildSpawnHarness(
  host: WorkflowHostPort,
  overrides: Partial<WorkflowEngineBrokerDeps> = {},
) {
  const steps: WorkflowStepSentInput[] = [];
  const stepActivities: WorkflowStepActivityEmitter = {
    emitSent: async (step) => {
      steps.push(step);
    },
    emitResolved: async () => {},
    emitRun: async () => {},
  };
  let id = 0;
  const deps: WorkflowEngineBrokerDeps = {
    runId: "run-spawn",
    launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
    projectId: ProjectId.make("project-1"),
    modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    host,
    newId: () => `id-${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    stepActivities,
    ...overrides,
  };
  return {
    broker: createWorkflowEngineBroker(deps),
    registry: deps.registry,
    steps,
    /** The steps that CLAIM a child exists — a refused create must never produce one. */
    spawnPips: () =>
      steps.filter((step) => step.stepKind === "thread.create" && step.phase === "completed"),
  };
}

/** Let Node's unhandled-rejection bookkeeping run (it fires after the microtask queue drains). */
export const flushRejections = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

/** A run's replay maps, read from the same `<runsRoot>/<runId>/journal.jsonl` the engine uses. */
export function readRunJournal(runsRoot: string, runId: string): JournalMaps {
  const file = NodePath.join(runsRoot, runId, "journal.jsonl");
  const lines = NodeFS.existsSync(file)
    ? NodeFS.readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
    : [];
  return buildJournalMaps(lines.map((line) => JSON.parse(line) as unknown));
}

/**
 * The lowest-seq `thread.turn` whose reply never landed. For the caught fixture that is the REFUSED
 * child's awaited half: its create was refused, so the turn fired, threw, and left a `sent` line
 * with no `resolved` partner — the exact journal shape replay has to make sense of.
 */
export function firstUnansweredTurn(journal: JournalMaps): string {
  const open = [...journal.bySeq.values()]
    .filter((entry) => entry.kind === "thread.turn" && entry.phase === "sent")
    .sort((left, right) => left.seq - right.seq)
    .find((entry) => !journal.byCorrelation.has(entry.correlationId ?? ""));
  if (open?.correlationId === undefined) {
    throw new Error("expected an unanswered thread.turn in the journal");
  }
  return open.correlationId;
}
