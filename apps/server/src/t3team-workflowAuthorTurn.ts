// @effect-diagnostics globalTimers:off -- the author turn deadline is a host wall-clock ceiling racing a provider turn, not an Effect schedule.
/**
 * Driving the author agent: ONE hidden ephemeral thread per run, and one awaited turn per request.
 *
 * The mechanism is the engine's own `thread.turn` ask, not a bespoke loop: the turn is dispatched
 * through the orchestration engine, the reactor resolves the registry's pending entry when the
 * provider's final assistant message lands (`t3team-workflowEngineReactorTasks.ts`), and the
 * author's tool calls arrive through the ordinary broker binding — scoped by the restricted tool
 * context installed here, so the author can validate, read the live model catalog and submit,
 * and nothing else.
 */
import { CommandId, MessageId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";
import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";

/** The author's entire tool surface. `t3team.orchestration.run` from this thread is a submission. */
export const WORKFLOW_AUTHOR_TOOL_IDS = [
  "t3team.runtime.models",
  "t3team.recipe.validate",
  "t3team.orchestration.run",
] as const;

export interface WorkflowAuthorThreadDeps {
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly contextStore?: Pick<T3TeamThreadToolContextStoreShape, "put"> | undefined;
  readonly newId: () => string;
  readonly nowIso: () => string;
}

export interface WorkflowAuthorThreadInput {
  readonly runId: string;
  readonly projectId: ProjectId;
  readonly authorModelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}

/** Create the hidden author thread and scope its tools. Returns its id. */
export async function createWorkflowAuthorThread(
  deps: WorkflowAuthorThreadDeps,
  input: WorkflowAuthorThreadInput,
): Promise<string> {
  const authorThreadId = `${input.runId}:author`;
  deps.registry.registerChildThread(input.runId, authorThreadId);
  await deps.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`t3team-wf:author:create:${deps.newId()}`),
    threadId: ThreadId.make(authorThreadId),
    projectId: input.projectId,
    title: "Orchestration author",
    modelSelection: input.authorModelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    branch: null,
    worktreePath: null,
    createdAt: deps.nowIso(),
    retention: "ephemeral",
  });
  if (deps.contextStore !== undefined) {
    await Effect.runPromise(
      deps.contextStore.put({
        threadId: ThreadId.make(authorThreadId),
        toolContext: {
          surface: "t3team",
          state: null,
          tools: WORKFLOW_AUTHOR_TOOL_IDS.map((id) => ({ id, capabilities: ["write" as const] })),
        },
      }),
    );
  }
  return authorThreadId;
}

export class WorkflowAuthorTurnStopped extends Error {
  constructor() {
    super("The orchestration was stopped while its author was working.");
  }
}

/**
 * Post one turn to the author thread and resolve with its final reply text. Rejects with
 * {@link WorkflowAuthorTurnStopped} when the run is stopped, or an Error on timeout.
 */
export function driveWorkflowAuthorTurn(
  deps: WorkflowAuthorThreadDeps,
  input: WorkflowAuthorThreadInput & {
    readonly authorThreadId: string;
    readonly correlationId: string;
    readonly text: string;
    readonly timeoutMs: number;
  },
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (settle: () => void) => {
      if (timer !== undefined) clearTimeout(timer);
      settle();
    };
    deps.registry.setPending(input.authorThreadId, {
      runId: input.runId,
      correlationId: input.correlationId,
      kind: "thread.turn",
      resolveLive: async (reply) =>
        done(() => resolve(typeof reply === "string" ? reply : JSON.stringify(reply))),
      cancelLive: () => done(() => reject(new WorkflowAuthorTurnStopped())),
    });
    timer = setTimeout(() => {
      deps.registry.takePending(input.authorThreadId);
      reject(new Error(`The orchestration author did not finish within ${input.timeoutMs} ms.`));
    }, input.timeoutMs);
    deps
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`t3team-wf:author:turn:${deps.newId()}`),
        threadId: ThreadId.make(input.authorThreadId),
        message: {
          messageId: MessageId.make(deps.newId()),
          role: "user",
          text: input.text,
          attachments: [],
          // Marks the start as automated for decider turn admission; nobody typed this.
          t3teamExt: { author: { kind: "system" } },
        },
        modelSelection: input.authorModelSelection,
        runtimeMode: input.runtimeMode,
        interactionMode: input.interactionMode,
        createdAt: deps.nowIso(),
      })
      .catch((error: unknown) => {
        deps.registry.takePending(input.authorThreadId);
        done(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}
