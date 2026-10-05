// @effect-diagnostics globalTimers:off -- the author turn deadline is a host wall-clock ceiling racing a provider turn, not an Effect schedule.
/**
 * Driving the author agent: ONE hidden ephemeral thread per run, and one awaited turn per request.
 *
 * The mechanism is the engine's own `thread.turn` ask, not a bespoke loop: the turn is queued
 * through the workflow host (`T3TeamWorkflowHost.startTurn`), the reactor resolves the registry's pending entry when the
 * provider's final assistant message lands (`t3team-workflowEngineReactorTasks.ts`), and the
 * author's tool calls arrive through the ordinary broker binding — scoped by the restricted tool
 * context installed here, so the author can validate and submit, and nothing else.
 */
import { ThreadId } from "@t3tools/contracts";
import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import { workflowAuthorThreadId } from "./t3team-workflowAuthorSession.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";
import { newWorkflowStepPromptMessageId } from "./t3team-workflowTurnPrompt.ts";

/**
 * The author runs in PLAN interaction mode (drivers that honor it drop native edit/shell tools)
 * AND always in `approval-required`, never the caller's runtime mode. A driver that still asks
 * the host is answered by `t3team-workflowAuthorApproval.ts` (wired into the V2 run's provider
 * event stream): a command, file read or change, or any non-host tool is declined. The prompt
 * never reaches a user who cannot see this hidden thread.
 */
export const WORKFLOW_AUTHOR_INTERACTION_MODE = "plan" as const;

/** Codex maps this to approvalPolicy `untrusted` and a read-only sandbox. Never the caller's mode. */
export const WORKFLOW_AUTHOR_RUNTIME_MODE = "approval-required" as const;

/**
 * The author's entire tool surface. `t3team.orchestration.run` from this thread is a submission.
 * The live model catalog rides the kickoff turn (`t3team-workflowAuthorPrompt.ts`): V2 has no
 * broker models tool, and upstream's `orchestrator_capabilities` needs the full orchestration
 * credential the author is never given (`t3team-workflowAuthorMcpScope.ts`).
 */
export const WORKFLOW_AUTHOR_TOOL_IDS = [
  "t3team.recipe.validate",
  "t3team.orchestration.run",
] as const;

export interface WorkflowAuthorThreadDeps {
  readonly host: Pick<WorkflowHostPort, "createThread" | "startTurn" | "interrupt">;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly contextStore?: Pick<T3TeamThreadToolContextStoreShape, "put"> | undefined;
  readonly newId: () => string;
  readonly nowIso: () => string;
}

export interface WorkflowAuthorThreadInput {
  readonly runId: string;
  readonly projectId: ProjectId;
  readonly authorModelSelection: ModelSelection;
  /** The caller's mode. The author thread ignores it and uses {@link WORKFLOW_AUTHOR_RUNTIME_MODE}. */
  readonly runtimeMode: RuntimeMode;
  /** The caller's mode. The author thread always runs in {@link WORKFLOW_AUTHOR_INTERACTION_MODE}. */
  readonly interactionMode: ProviderInteractionMode;
}

/** Create the hidden author thread and scope its tools. Returns its id. */
export async function createWorkflowAuthorThread(
  deps: WorkflowAuthorThreadDeps,
  input: WorkflowAuthorThreadInput,
): Promise<string> {
  const authorThreadId = workflowAuthorThreadId(input.runId);
  deps.registry.registerChildThread(input.runId, authorThreadId);
  // The tool scope lands BEFORE the thread exists, so no turn can ever bind the generic set.
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
  // No `parentThreadId`: the author is hidden host machinery, never a roster child.
  await deps.host.createThread({
    threadId: authorThreadId,
    projectId: input.projectId,
    title: "Orchestration author",
    modelSelection: input.authorModelSelection,
    runtimeMode: WORKFLOW_AUTHOR_RUNTIME_MODE,
    interactionMode: WORKFLOW_AUTHOR_INTERACTION_MODE,
    retention: "ephemeral",
  });
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
    // The reactor matches the answer by the prompt message id, unique per attempt.
    const promptMessageId = newWorkflowStepPromptMessageId(
      `${input.correlationId}:${deps.newId()}`,
    );
    deps.registry.setPending(input.authorThreadId, {
      runId: input.runId,
      correlationId: input.correlationId,
      kind: "thread.turn",
      promptMessageId,
      resolveLive: async (reply) =>
        done(() => resolve(typeof reply === "string" ? reply : JSON.stringify(reply))),
      cancelLive: () => done(() => reject(new WorkflowAuthorTurnStopped())),
    });
    timer = setTimeout(() => {
      deps.registry.takePending(input.authorThreadId);
      // The provider keeps spending otherwise: stop the turn, not just our wait on it.
      void deps.host
        .interrupt({ threadId: input.authorThreadId, reason: "Orchestration author timed out" })
        .catch(() => {});
      reject(new Error(`The orchestration author did not finish within ${input.timeoutMs} ms.`));
    }, input.timeoutMs);
    deps.host
      .startTurn({
        threadId: input.authorThreadId,
        messageId: promptMessageId,
        text: input.text,
        modelSelection: input.authorModelSelection,
        // Marks the turn as automated; nobody typed this.
        author: { kind: "system", workflowRunId: input.runId },
      })
      .catch((error: unknown) => {
        deps.registry.takePending(input.authorThreadId);
        done(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
  });
}
