/**
 * Shared scaffolding for the workflow-engine integration tests on orchestration V2: a project on
 * a git workspace, a launch thread, a launch through the REAL `launchWorkflowRecipe` and workflow
 * host, and observe-only waits on the registry / thread records.
 *
 * The runtime itself is `makeWorkflowStubRuntime` (t3team-workflowStubRuntime.ts): the real V2
 * orchestrator + workflow engine with a scripted agent.
 */
import { MessageId, ProjectId, ThreadId, CommandId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { checkpointWorkspace } from "./orchestration-v2/testkit/ReplayFixtureWorkspace.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import { WORKFLOW_STUB_MODEL_SELECTION } from "./t3team-workflowStubAgentTurn.ts";
import { createWorkflowStubThread, seedWorkflowStubProject } from "./t3team-workflowStubRuntime.ts";

export const SCENARIO_ISO = "2026-10-03T00:00:00.000Z";

/** Poll an observe-only predicate (never resolves an ask) until it holds or times out. */
export const waitUntil = (
  predicate: () => boolean | Effect.Effect<boolean>,
  label: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 2000; i += 1) {
      const result = predicate();
      if (typeof result === "boolean" ? result : yield* result) return;
      yield* Effect.sleep(Duration.millis(5));
    }
    return yield* Effect.die(new Error(`timed out waiting for: ${label}`));
  });

/** A project on a fresh git workspace plus a launch thread on the scripted agent's model. */
export const setUpLaunchThread = (name: string) =>
  Effect.gen(function* () {
    const workspaceRoot = yield* checkpointWorkspace(name);
    const projectId = ProjectId.make(`project:${name}`);
    const launchThreadId = `thread:${name}:launch`;
    yield* seedWorkflowStubProject({ projectId, workspaceRoot });
    yield* createWorkflowStubThread({ threadId: launchThreadId, projectId });
    return { projectId, launchThreadId, workspaceRoot };
  });

/** Launch a workflow through the real launch funnel and workflow host. */
export const launchScenarioWorkflow = (
  input: {
    readonly runId: string;
    readonly workflowPath: string;
    readonly launchThreadId: string;
    readonly projectId: ProjectId;
    readonly runsRoot: string;
    readonly args?: unknown;
  } & Partial<Pick<LaunchWorkflowRecipeInput, "lifecycle" | "store" | "scripts">>,
) =>
  Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const host = toWorkflowHostPort(yield* T3TeamWorkflowHost);
    const completed: unknown[] = [];
    const errors: unknown[] = [];
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId: input.runId,
        workflowPath: input.workflowPath,
        args: input.args ?? {},
        runsRoot: input.runsRoot,
        launchThreadId: input.launchThreadId,
        projectId: input.projectId,
        modelSelection: createModelSelection(
          WORKFLOW_STUB_MODEL_SELECTION.instanceId,
          WORKFLOW_STUB_MODEL_SELECTION.model,
        ),
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        host,
        newId: () => `${input.runId}-id-${(seq += 1)}`,
        nowIso: () => SCENARIO_ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
        onError: async (error) => {
          errors.push(error);
        },
        ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
        ...(input.store === undefined ? {} : { store: input.store }),
        ...(input.scripts === undefined ? {} : { scripts: input.scripts }),
      }),
    );
    return { launched, completed, errors, host };
  });

/** A person types `text` on `threadId` (the composer path: it queues an agent turn too). */
export const typeUserMessage = (threadId: string, text: string, nonce: string) =>
  Effect.flatMap(ThreadManagementService, (threads) =>
    threads.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`user-reply:${nonce}`),
      threadId: ThreadId.make(threadId),
      messageId: MessageId.make(`user-reply-msg:${nonce}`),
      text,
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
      createdBy: "user",
      creationSource: "web",
    }),
  );

/** The thread's messages (all roles), oldest first. */
export const threadMessages = (threadId: string) =>
  Effect.flatMap(ThreadManagementService, (threads) =>
    threads.getThreadRecords(ThreadId.make(threadId), ["messages"]),
  ).pipe(Effect.map(({ messages }) => messages));
