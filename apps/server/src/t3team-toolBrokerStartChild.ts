import { CommandId, MessageId, ThreadId, type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import { type T3TeamStartChildLoadThreadProject } from "./t3team-toolBrokerStartChildActivity.ts";
import {
  mapKickoffModeToInteractionMode,
  readModelSelectionReasoningEffort,
  readStartChildArgs,
} from "./t3team-toolBrokerStartChildArgs.ts";
import { resolveChildModel } from "./t3team-toolBrokerStartChildProvider.ts";
import {
  resolveStartChildSetupScript,
  type T3TeamStartChildServices,
} from "./t3team-toolBrokerStartChildContext.ts";
import { resolveStartChildWorktree } from "./t3team-toolBrokerStartChildWorktree.ts";
import {
  appendStartChildHandoffActivities,
  buildChildKickoffText,
  buildChildKickoffTurnCommand,
  resolveStartChildHandoffPlacement,
} from "./t3team-toolBrokerStartChildHandoff.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { buildStartChildResult } from "./t3team-toolBrokerStartChildResult.ts";
import {
  createChildThreadToolContext,
  readThreadDisplayModeFromToolContext,
  readTicketIdFromThreadToolContext,
} from "./t3team-toolBrokerStartChildToolContext.ts";

export function makeStartChildThread(input: {
  readonly loadThreadProject: T3TeamStartChildLoadThreadProject;
  readonly orchestration: OrchestrationEngineShape;
  readonly contextStore: T3TeamThreadToolContextStoreShape;
  readonly services: Partial<T3TeamStartChildServices>;
}) {
  return (threadId: ThreadIdType, rawArgs: unknown) =>
    Effect.gen(function* () {
      const parsed = readStartChildArgs(rawArgs);
      if (!parsed.ok) {
        return yield* Effect.fail(parsed.message);
      }

      const args = parsed.value;
      const { project, thread } = yield* input.loadThreadProject(threadId);
      const parentToolContext = yield* input.contextStore.get(threadId);
      const baseModelSelection = thread.modelSelection ?? project.defaultModelSelection;
      if (!baseModelSelection)
        return yield* Effect.fail("Current t3team thread does not have a model selection.");

      const childThreadId = ThreadId.make(t3teamRandomUUID());
      const currentTicketId = readTicketIdFromThreadToolContext(parentToolContext);
      const currentDisplayMode = readThreadDisplayModeFromToolContext(parentToolContext);
      const { parentThreadId, ticketId } = resolveStartChildHandoffPlacement({
        currentDisplayMode,
        currentTicketId,
        requestedTicketId: args.ticketId,
        threadId: thread.id,
        workflowLaunchThreadId: input.services.workflowLaunchThreadForChild?.(thread.id),
      });
      const { listProviders } = input.services;
      const { modelSelection, effortNote, modelRouting } = yield* resolveChildModel(
        baseModelSelection,
        args,
        listProviders,
      );
      const interactionMode = mapKickoffModeToInteractionMode(args.kickoffMode);
      const createdAt = DateTime.formatIso(yield* DateTime.now),
        requestedKickoffMode = args.kickoffMode ?? (args.kickoffPrompt ? "interactive" : undefined);

      const { repoFullName, repoRef, branch, worktreePath } = yield* resolveStartChildWorktree({
        services: input.services,
        projectWorkspaceRoot: project.workspaceRoot,
        args,
        childThreadId,
      });

      // Environment binding (additive): an explicit `environment` argument that
      // names THIS server's own id is a same-environment no-op — the binding is
      // omitted entirely, keeping the thread.create command byte-identical to
      // pre-environment behavior. Anything else stamps the thread record, the
      // handoff activity, and the launch result, with the delivery boundary
      // documented on the result (`environmentNote`):
      // inter-agent messaging (send_message / mailbox / children ops) only
      // reaches threads in THIS environment; report-back from a cross-env
      // child needs a separate channel (no relay is invented here).
      const localEnvironmentId = input.services.localEnvironmentId;
      const environment =
        args.environment !== undefined &&
        localEnvironmentId !== undefined &&
        args.environment.environmentId === localEnvironmentId
          ? undefined
          : args.environment;
      const environmentNote =
        environment !== undefined
          ? `Child session is bound to environment '${environment.label ?? environment.environmentId}' (a different T3 server). The thread record and handoff here are stamped with that environment, but inter-agent messaging (send_message, mailbox, children ops) only reaches threads in THIS environment; report-back from the cross-environment child needs a separate channel.`
          : undefined;

      const childToolContext = createChildThreadToolContext({
        parentToolContext,
        projectId: thread.projectId,
        projectTitle: project.title,
        workspaceRoot: project.workspaceRoot,
        threadId: childThreadId,
        threadTitle: args.name,
        ...(ticketId ? { ticketId } : {}),
      });

      yield* input.orchestration.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`server:t3team:start-child:create:${t3teamRandomUUID()}`),
        threadId: childThreadId,
        projectId: thread.projectId,
        title: args.name,
        modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode,
        branch,
        worktreePath,
        ...(environment ? { environment } : {}),
        createdAt,
      });

      if (childToolContext) {
        yield* input.contextStore.put({ threadId: childThreadId, toolContext: childToolContext });
      }

      const { setupScriptStatus, setupScriptTerminalId } = yield* resolveStartChildSetupScript({
        services: input.services,
        threadId: childThreadId,
        projectId: thread.projectId,
        worktreePath,
      });

      yield* appendStartChildHandoffActivities({
        orchestration: input.orchestration,
        threadId: thread.id,
        threadTitle: thread.title,
        childThreadId,
        childTitle: args.name,
        createdAt,
        ...(parentThreadId ? { handoffParentThreadId: parentThreadId } : {}),
        ...(ticketId ? { ticketId } : {}),
        ...(repoFullName ? { repoFullName } : {}),
        ...(repoRef ? { repoRef } : {}),
        ...(branch ? { branch } : {}),
        ...(worktreePath ? { worktreePath } : {}),
        ...(args.kickoffPrompt ? { kickoffPrompt: args.kickoffPrompt } : {}),
        ...(environment ? { environment } : {}),
      });

      let started = false,
        startupError: string | undefined;

      if (args.kickoffPrompt) {
        const kickoffCreatedAt = DateTime.formatIso(yield* DateTime.now);
        const startResult = yield* input.orchestration
          .dispatch(
            buildChildKickoffTurnCommand({
              childThreadId,
              commandId: `server:t3team:start-child:kickoff:${t3teamRandomUUID()}`,
              messageId: t3teamRandomUUID(),
              text: buildChildKickoffText(thread, args.kickoffPrompt),
              modelSelection,
              titleSeed: args.name,
              runtimeMode: thread.runtimeMode,
              interactionMode,
              createdAt: kickoffCreatedAt,
            }),
          )
          .pipe(Effect.result);

        if (startResult._tag === "Success") {
          started = true;
        } else {
          startupError =
            startResult.failure instanceof Error
              ? startResult.failure.message
              : String(startResult.failure);
        }
      }

      const reasoningEffort = readModelSelectionReasoningEffort(modelSelection);
      return buildStartChildResult({
        projectId: thread.projectId,
        childThreadId,
        name: args.name,
        isolation: args.isolation,
        usedLegacyExecutionScope: args.usedLegacyExecutionScope,
        started,
        interactionMode,
        runtimeMode: thread.runtimeMode,
        provider: modelSelection.instanceId,
        model: modelSelection.model,
        ...(environment ? { environment } : {}),
        ...(environmentNote ? { environmentNote } : {}),
        ...(args.model ? { requestedModel: args.model } : {}),
        ...(effortNote ? { effortNote } : {}),
        ...(modelRouting ? { modelRouting } : {}),
        setupScriptStatus,
        ...(requestedKickoffMode ? { requestedKickoffMode } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        repoFullName,
        repoRef,
        branch,
        worktreePath,
        setupScriptTerminalId,
        ...(startupError ? { startupError } : {}),
      });
    });
}
