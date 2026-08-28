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
  hasLinkedRepositoryStartChildServices,
  linkedRepositoryManifestExists,
  readMetaRepositoryFromWorkspace,
  resolveLinkedRepositoryWorktree,
  resolveLocalRepositoryWorktree,
  resolveStartChildSetupScript,
  type T3TeamStartChildServices,
} from "./t3team-toolBrokerStartChildContext.ts";
import { repositoryLookupCandidates } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
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
      const { modelSelection, effortNote } = yield* resolveChildModel(
        baseModelSelection,
        args,
        listProviders,
      );
      const interactionMode = mapKickoffModeToInteractionMode(args.kickoffMode);
      const createdAt = DateTime.formatIso(yield* DateTime.now),
        requestedKickoffMode = args.kickoffMode ?? (args.kickoffPrompt ? "interactive" : undefined);

      let repoFullName: string | null = null,
        repoRef: string | null = null,
        branch: string | null = null,
        worktreePath: string | null = null;

      if (args.isolation === "own-worktree") {
        if (!hasLinkedRepositoryStartChildServices(input.services)) {
          return yield* Effect.fail(
            "t3team.thread.start_child worktree isolation is unavailable in this runtime.",
          );
        }

        const manifestExists = yield* linkedRepositoryManifestExists({
          services: input.services,
          projectWorkspaceRoot: project.workspaceRoot,
        });

        // Adopted meta-repo (monorepo project, GHE #42): the manifest carries a `metaRepository`
        // entry — sub-work happens in worktrees of the workspace repository itself. Legacy
        // wrapped projects have no such entry and keep the linked-repo-only behavior.
        const metaRepository = manifestExists
          ? yield* readMetaRepositoryFromWorkspace({
              services: input.services,
              projectWorkspaceRoot: project.workspaceRoot,
            })
          : undefined;
        const requestedRepoIsMetaRepository =
          metaRepository?.url !== undefined &&
          args.repoFullName !== undefined &&
          repositoryLookupCandidates(metaRepository.url).some((candidate) =>
            repositoryLookupCandidates(args.repoFullName as string).includes(candidate),
          );

        if (args.repoFullName) {
          if (!manifestExists) {
            return yield* Effect.fail(
              `This project workspace has no linked repositories, so 'repo_full_name' cannot be used. Omit 'repo_full_name' to isolate the child in a worktree of the local repository, or use isolation='shared' for the shared checkout.`,
            );
          }

          if (requestedRepoIsMetaRepository) {
            const resolvedMetaRepository = yield* resolveLocalRepositoryWorktree({
              services: input.services,
              projectWorkspaceRoot: project.workspaceRoot,
              ...(args.repoRef ? { repoRef: args.repoRef } : {}),
              sessionName: args.name,
              childThreadId,
            });
            ({ repoFullName, repoRef, branch, worktreePath } = {
              repoFullName: metaRepository?.url ?? args.repoFullName,
              ...resolvedMetaRepository,
            });
          } else {
            const resolvedRepository = yield* resolveLinkedRepositoryWorktree({
              services: input.services,
              projectWorkspaceRoot: project.workspaceRoot,
              repoFullName: args.repoFullName,
              ...(args.repoRef ? { repoRef: args.repoRef } : {}),
              sessionName: args.name,
              childThreadId,
            });
            ({ repoFullName, repoRef, branch, worktreePath } = resolvedRepository);
          }
        } else {
          if (manifestExists && !metaRepository) {
            return yield* Effect.fail(
              `This project has linked repositories; pass 'repo_full_name' to choose which one the child isolates in a worktree, or use isolation='shared' to run it in the shared project workspace.`,
            );
          }

          const resolvedLocalRepository = yield* resolveLocalRepositoryWorktree({
            services: input.services,
            projectWorkspaceRoot: project.workspaceRoot,
            ...(args.repoRef ? { repoRef: args.repoRef } : {}),
            sessionName: args.name,
            childThreadId,
          });
          ({ repoRef, branch, worktreePath } = resolvedLocalRepository);
          if (metaRepository) {
            repoFullName = metaRepository.url ?? null;
          }
        }
      }

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
        ...(args.model ? { requestedModel: args.model } : {}),
        ...(effortNote ? { effortNote } : {}),
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
