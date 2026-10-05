/**
 * This host's delegate_task preparation hook (`mcp/t3team-delegatedTaskPreparation.ts`):
 * worktree isolation (linked repo, meta-repo or local repository, plus the project setup
 * script) and the `effort` / `ticketId` / `environment` extensions. Provided once to
 * `McpHttpServer.layer` in server.ts. Side effects after the child exists (`afterCreate`)
 * never fail the delegation: each one degrades to a note in the tool result.
 */
import { OrchestratorMcpFailure, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import {
  DelegatedTaskPreparation,
  type DelegatedTaskPreparationShape,
  rejectUnsupportedDelegationInput,
} from "./mcp/t3team-delegatedTaskPreparation.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import { ResourcePressureMonitor } from "./t3team-resourcePressureMonitor.ts";
import {
  applyDelegationEffort,
  delegationPressureNotes,
  parseDelegationExtensions,
  resolveEnvironmentBinding,
  T3TEAM_DELEGATION_EXTENSIONS,
} from "./t3team-delegateTaskExtensions.ts";
import { makeDelegatedChildRecorder } from "./t3team-delegateTaskRecordChild.ts";
import {
  delegatedWorktreeKey,
  describeDelegatedWorkspace,
  releaseDelegatedWorkspace,
  resolveDelegatedWorkspace,
} from "./t3team-delegateTaskWorkspace.ts";
import { startChildSetupScript } from "./t3team-toolBrokerStartChildContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

const failure = (code: OrchestratorMcpFailure["code"], message: string) =>
  new OrchestratorMcpFailure({ code, message });

const make = Effect.gen(function* () {
  const services = {
    fileSystem: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    gitWorkflow: yield* GitWorkflowService,
    sourceControlProviders: yield* SourceControlProviderRegistry,
  };
  const setupScripts = yield* ProjectSetupScriptRunner;
  const providers = yield* ProviderRegistry;
  const projects = yield* ProjectStoreV2;
  const pressureNotes = delegationPressureNotes(
    Option.getOrUndefined(yield* Effect.serviceOption(ResourcePressureMonitor)),
  );
  const workflows = Option.getOrUndefined(
    yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry),
  );
  const recordChild = makeDelegatedChildRecorder({
    metadata: yield* T3TeamChildThreadMetadata,
    facts: yield* T3TeamThreadFactsStore,
    loadProject: (projectId) =>
      projects.getShell(projectId).pipe(
        Effect.map(Option.getOrUndefined),
        Effect.orElseSucceed(() => undefined),
      ),
    toolContexts: Option.getOrUndefined(yield* Effect.serviceOption(T3TeamThreadToolContextStore)),
    workflowLaunchThreadFor: workflows?.launchThreadForChildThread,
  });

  const loadProjectShell = (projectId: Parameters<typeof projects.getShell>[0]) =>
    projects.getShell(projectId).pipe(
      Effect.mapError((error) => failure("orchestration_error", error.message)),
      Effect.flatMap((shell) =>
        Option.isSome(shell)
          ? Effect.succeed(shell.value)
          : Effect.fail(failure("thread_not_found", `Project ${projectId} was not found.`)),
      ),
    );

  const preparation: DelegatedTaskPreparationShape = {
    workspaceIsolation: true,
    extensions: T3TEAM_DELEGATION_EXTENSIONS,
    prepare: (input) =>
      Effect.gen(function* () {
        yield* rejectUnsupportedDelegationInput(input, preparation);
        const parsed = parseDelegationExtensions(input.extensions);
        if (!parsed.ok) return yield* failure("invalid_request", parsed.message);
        const extensions = parsed.value;
        const notes: Array<string> = [];

        const effort = applyDelegationEffort({
          modelSelection: input.modelSelection,
          effort: extensions.effort,
          explicitTargetOptions: input.explicitTargetOptions,
          providers: yield* providers.getProviders,
        });
        if (effort.note !== undefined) notes.push(effort.note);

        const { parentThread } = input;
        const isolated = input.workspace?.isolation === "worktree" ? input.workspace : undefined;
        const project =
          isolated === undefined ? undefined : yield* loadProjectShell(parentThread.projectId);
        const workspace =
          isolated === undefined || project === undefined
            ? undefined
            : yield* resolveDelegatedWorkspace({
                services,
                projectWorkspaceRoot: project.workspaceRoot,
                projectMainRepository: project.mainRepository,
                repository: isolated.repository,
                baseRef: isolated.baseRef,
                branchSeed: input.title ?? "child",
                worktreeKey: delegatedWorktreeKey(parentThread.id, input.requestKey),
              }).pipe(Effect.mapError((message) => failure("invalid_request", message)));
        if (workspace !== undefined) notes.push(describeDelegatedWorkspace(workspace));
        const environment = resolveEnvironmentBinding(
          extensions.environment,
          input.scope.environmentId,
        );
        if (environment.note !== undefined) notes.push(environment.note);
        notes.push(...(yield* pressureNotes));

        const afterCreate = (childThreadId: ThreadId) =>
          Effect.gen(function* () {
            const childNotes = yield* recordChild({
              parentThread,
              childThreadId,
              title: input.title,
              ticketId: extensions.ticketId,
              environment: environment.binding,
            });
            if (workspace === undefined) return childNotes;
            const setup = yield* startChildSetupScript({
              runner: setupScripts,
              threadId: childThreadId,
              projectId: parentThread.projectId,
              worktreePath: workspace.worktreePath,
            });
            return [...childNotes, setup];
          });

        return {
          modelSelection: effort.modelSelection,
          ...(workspace === undefined
            ? {}
            : {
                workspace: { branch: workspace.branch, worktreePath: workspace.worktreePath },
                release: releaseDelegatedWorkspace(services.gitWorkflow, workspace),
              }),
          notes,
          afterCreate,
        };
      }),
  };
  return preparation;
});

export const T3TeamDelegatedTaskPreparationLive = Layer.effect(DelegatedTaskPreparation, make);
