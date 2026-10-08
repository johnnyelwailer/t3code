/**
 * `T3TeamWorkflowHost`: the workflow engine's port onto orchestration V2.
 *
 * The engine (broker, controller, run lifecycle, reactor) states intents — spawn a thread, ask
 * an agent, post a note, draw a step pip, stop a thread, refresh the run's status facts — and
 * this service maps each onto V2:
 *   • threads and turns go through `ThreadManagementService` (`thread.create`, a queued
 *     `message.dispatch`, `interruptThread`), so they take the orchestrator's own lock and
 *     legacy-transcript hydration;
 *   • run-less notes go through the fork recorder, rich rows (decision cards, widgets, step
 *     pips) through the fork artifacts store, run status through the fork facts store (and a
 *     waiting `user.input` ask through the fork workflow-ask mirror on the asked thread), and
 *     workflow children are linked to their launch thread through the fork lineage writer.
 * None of these writers is built here: the server registers each once and this layer consumes
 * them, so the engine shares the orchestrator's lock and event sink by reference.
 *
 * Run-less notes flagged `afterActiveRun` are held while the thread is mid-run and posted when
 * that run ends (t3team-workflowHostHeld.ts; `flushHeld` is driven by the workflow reactor).
 */
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { STOP_CASCADE_COMMAND_PREFIX } from "./t3team-actorMessageReactor.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { T3TeamThreadLineage } from "./t3team-v2/t3team-threadLineage.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";
import { T3TeamThreadWorkflowAsk } from "./t3team-v2/t3team-threadWorkflowAsk.ts";
import { syncWorkflowAskMirrors } from "./t3team-workflowHostAskMirror.ts";
import { makeHeldWorkflowMessages } from "./t3team-workflowHostHeld.ts";
import { splitWorkflowMessage } from "./t3team-workflowHostMessages.ts";
import type {
  WorkflowHostActivityInput,
  WorkflowHostActivityPayload,
  WorkflowHostCreateThreadInput,
  WorkflowHostInterruptInput,
  WorkflowHostMessageInput,
  WorkflowHostPort,
  WorkflowHostStartTurnInput,
} from "./t3team-workflowHostPort.ts";
import { failAs, T3TeamWorkflowHostError } from "./t3team-workflowHostFail.ts";
import { readWorkflowRunFacts } from "./t3team-workflowHostRunFacts.ts";
import { workflowPromptContext } from "./t3team-workflowTurnPrompt.ts";

export { T3TeamWorkflowHostError };

type HostEffect = Effect.Effect<void, T3TeamWorkflowHostError>;

export interface T3TeamWorkflowHostShape {
  readonly createThread: (input: WorkflowHostCreateThreadInput) => HostEffect;
  readonly startTurn: (input: WorkflowHostStartTurnInput) => HostEffect;
  readonly postMessage: (input: WorkflowHostMessageInput) => HostEffect;
  readonly upsertActivity: (input: WorkflowHostActivityInput) => HostEffect;
  readonly interrupt: (input: WorkflowHostInterruptInput) => HostEffect;
  readonly archiveThread: (threadId: string) => HostEffect;
  readonly syncRunFacts: (launchThreadId: string) => HostEffect;
  /** Post the held `afterActiveRun` messages of a thread whose run has ended. */
  readonly flushHeld: (threadId: string) => HostEffect;
  /** Threads with held messages (the reactor's sweep re-checks them). */
  readonly heldThreadIds: () => ReadonlyArray<string>;
}

export class T3TeamWorkflowHost extends Context.Service<
  T3TeamWorkflowHost,
  T3TeamWorkflowHostShape
>()("t3/t3team-workflowHost/T3TeamWorkflowHost") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService;
  const recorder = yield* T3TeamThreadMessageRecorder;
  const artifacts = yield* T3TeamThreadArtifactsStore;
  const facts = yield* T3TeamThreadFactsStore;
  const lineage = yield* T3TeamThreadLineage;
  const workflowAsk = yield* T3TeamThreadWorkflowAsk;
  const sql = yield* SqlClient.SqlClient;
  const writeMessage = (input: WorkflowHostMessageInput) =>
    Effect.gen(function* () {
      const writes = splitWorkflowMessage(input);
      if (writes.record !== undefined) yield* recorder.record(writes.record);
      yield* Effect.forEach(writes.artifacts, artifacts.upsert, { discard: true });
    });

  const hasActiveRun = (threadId: string) =>
    threads
      .getThreadShell(ThreadId.make(threadId))
      .pipe(Effect.map((shell) => shell !== null && shell.activeRunId !== null));

  const held = makeHeldWorkflowMessages({ hasActiveRun, write: writeMessage });
  const postMessage = (input: WorkflowHostMessageInput) =>
    held.post(input).pipe(failAs("postMessage"));
  const flushHeld = (threadId: string) => held.flush(threadId).pipe(failAs("flushHeld"));

  const createThread = (input: WorkflowHostCreateThreadInput) =>
    Effect.gen(function* () {
      const threadId = ThreadId.make(input.threadId);
      // Deterministic: the engine re-fires a spawn only when its journal says it never landed,
      // and a receipt makes a duplicate a no-op rather than a second thread.
      yield* threads.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`t3team-wf:create:${input.threadId}`),
        threadId,
        projectId: input.projectId,
        title: input.title,
        modelSelection: input.modelSelection,
        runtimeMode: input.runtimeMode,
        interactionMode: input.interactionMode,
        branch: null,
        worktreePath: null,
        createdBy: "system",
        creationSource: "server",
      });
      yield* facts.upsert(threadId, { retention: input.retention });
      if (input.parentThreadId !== undefined) {
        yield* lineage.setThreadLineage({
          threadId,
          parentThreadId: ThreadId.make(input.parentThreadId),
          relationshipToParent: "subagent",
        });
      }
    }).pipe(failAs("createThread"));

  const startTurn = (input: WorkflowHostStartTurnInput) =>
    failAs("startTurn")(
      threads.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`t3team-wf:turn:${input.messageId}`),
        threadId: ThreadId.make(input.threadId),
        messageId: MessageId.make(input.messageId),
        text: input.text,
        context: workflowPromptContext(input.author),
        attachments: [],
        ...(input.modelSelection === undefined ? {} : { modelSelection: input.modelSelection }),
        dispatchMode: { type: "queue_after_active" },
        createdBy: "system",
        creationSource: "server",
      }),
    );

  const upsertActivity = (input: WorkflowHostActivityInput) =>
    failAs("upsertActivity")(
      artifacts.upsert({
        id: input.id,
        threadId: ThreadId.make(input.threadId),
        messageId: null,
        kind: input.kind,
        payload: {
          tone: input.tone,
          summary: input.summary,
          payload: input.payload,
        } satisfies WorkflowHostActivityPayload,
      }),
    );

  const interrupt = (input: WorkflowHostInterruptInput) =>
    Effect.gen(function* () {
      const threadId = ThreadId.make(input.threadId);
      const shell = yield* threads.getThreadShell(threadId);
      if (shell === null || shell.activeRunId === null) return;
      yield* threads.interruptThread({
        projectId: shell.projectId,
        commandId: CommandId.make(
          `${input.origin === "user" ? STOP_CASCADE_COMMAND_PREFIX : "t3team-wf:interrupt:"}${t3teamRandomUUID()}`,
        ),
        threadId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
    }).pipe(failAs("interrupt"));

  // Deterministic id: retiring the same thread twice is one archive, not a second command.
  const archiveThread = (threadId: string) =>
    failAs("archiveThread")(
      threads.dispatch({
        type: "thread.archive",
        commandId: CommandId.make(`t3team-wf:archive:${threadId}`),
        threadId: ThreadId.make(threadId),
      }),
    );

  // The run's waiting question also mirrors onto the asked thread's shell (notifications, sidebar).
  const syncRunFacts = (launchThreadId: string) =>
    readWorkflowRunFacts(sql, launchThreadId).pipe(
      Effect.flatMap((patch) => facts.upsert(ThreadId.make(launchThreadId), patch)),
      Effect.andThen(syncWorkflowAskMirrors({ sql, writer: workflowAsk, launchThreadId })),
      failAs("syncRunFacts"),
    );

  return T3TeamWorkflowHost.of({
    createThread,
    startTurn,
    postMessage,
    upsertActivity,
    interrupt,
    archiveThread,
    syncRunFacts,
    flushHeld,
    heldThreadIds: held.heldThreadIds,
  });
});

export const layer = Layer.effect(T3TeamWorkflowHost, make);

/** The Promise view the engine calls; host failures reject with the host error. */
export const toWorkflowHostPort = (host: T3TeamWorkflowHostShape): WorkflowHostPort => ({
  createThread: (input) => Effect.runPromise(host.createThread(input)),
  startTurn: (input) => Effect.runPromise(host.startTurn(input)),
  postMessage: (input) => Effect.runPromise(host.postMessage(input)),
  upsertActivity: (input) => Effect.runPromise(host.upsertActivity(input)),
  interrupt: (input) => Effect.runPromise(host.interrupt(input)),
  archiveThread: (threadId) => Effect.runPromise(host.archiveThread(threadId)),
  syncRunFacts: (launchThreadId) => Effect.runPromise(host.syncRunFacts(launchThreadId)),
});
