/**
 * What the `RunToggle` switch does (doc 07 §2.3): on launches the recipe's default action as a
 * workflow thread; off stops the run, then "stop including sub-runs" and the watch command on
 * every thread the run watches with; retry re-drives a failed run; the pencil opens the config.
 */
import { CommandId, type EnvironmentId } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import { randomUUID } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { stopThreadCascade } from "~/t3team/chat/t3team-useStopCascade";
import type { RunTogglePending } from "~/t3team/t3team-recipeRunToggleState";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

/** How long the card shows "Starting" on its own before the launch fact must have arrived. */
const STARTING_GRACE_MS = 20_000;

export function useRecipeRunToggleActions(input: {
  readonly recipe: T3TeamSidecarRecipeQuickStart | null;
  readonly environmentId: EnvironmentId | null;
  readonly run: RecipeRunSnapshot;
  readonly configPath: string | null;
}) {
  const backend = useBackend();
  const serverConfig = useServerConfigs().get(input.environmentId ?? ("" as EnvironmentId));
  const cascadeSupported = serverConfig?.environment.capabilities.t3team?.stopCascade === true;
  const stopCascade = useAtomCommand(stopThreadCascade, { reportFailure: true });
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: true });
  const openInEditor = useOpenInPreferredEditor(
    input.environmentId,
    serverConfig?.availableEditors ?? [],
  );
  const [pending, setPending] = useState<RunTogglePending>(null);
  const { recipe, environmentId, run } = input;
  const workspaceRoot = recipe?.actionView?.context.project.workspaceRoot;

  const start = useCallback(async () => {
    const launch = recipe?.workflow;
    if (!backend || !launch || !workspaceRoot) {
      toastManager.add({
        type: "warning",
        title: "Cannot start",
        description: "This recipe has no workflow to run in this project.",
      });
      return;
    }
    setPending("starting");
    try {
      const response = await backend.launchRecipeWorkflow({
        workspaceRoot,
        kickoffMessage: "",
        titleSeed: launch.title,
        createdAt: new Date().toISOString(),
        launch: {
          kind: "recipe",
          recipeId: launch.recipeId,
          ...(launch.recipeVersion ? { recipeVersion: launch.recipeVersion } : {}),
          ...(launch.parameters ? { parameters: launch.parameters } : {}),
          ...(launch.kickoff ? { kickoff: launch.kickoff } : {}),
          title: launch.title,
          description: launch.description,
          source: launch.source,
          surface: launch.surface,
          ...(launch.recipePath ? { recipePath: launch.recipePath } : {}),
          ...(launch.promptPath ? { promptPath: launch.promptPath } : {}),
          ...(launch.workflowPath ? { workflowPath: launch.workflowPath } : {}),
          ...(launch.allowedToolGroups ? { allowedToolGroups: [...launch.allowedToolGroups] } : {}),
        },
      });
      if (!response.ok) throw new Error("The server refused to start the run.");
      // The launch fact flips the card to its live state; this only covers the gap.
      window.setTimeout(
        () => setPending((current) => (current === "starting" ? null : current)),
        STARTING_GRACE_MS,
      );
    } catch (error) {
      setPending(null);
      toastManager.add({
        type: "error",
        title: "Could not start",
        description: error instanceof Error ? error.message : "The launch failed.",
      });
    }
  }, [backend, recipe, workspaceRoot]);

  const stop = useCallback(async () => {
    if (!backend || environmentId === null) return;
    setPending("stopping");
    try {
      const home = run.home;
      if (home?.workflowRunStatus?.runId && backend.controlWorkflow) {
        await backend.controlWorkflow({
          threadId: home.threadRef.threadId,
          workflowRunId: home.workflowRunStatus.runId,
          action: "stop",
        });
      }
      for (const watcher of run.watchThreads) {
        const { threadId } = watcher.threadRef;
        if (cascadeSupported) {
          await stopCascade({
            environmentId,
            input: { threadId, commandId: CommandId.make(randomUUID()) },
          });
        }
        await watch({
          environmentId,
          input: {
            threadId,
            host: watcher.link.host,
            repository: watcher.link.repository,
            number: watcher.link.number,
            watching: false,
          },
        });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not stop",
        description: error instanceof Error ? error.message : "The stop failed.",
      });
    } finally {
      setPending(null);
    }
  }, [backend, cascadeSupported, environmentId, run, stopCascade, watch]);

  const retry = useCallback(async () => {
    const home = run.home;
    if (!backend?.controlWorkflow || !home?.workflowRunStatus?.runId) return;
    await backend.controlWorkflow({
      threadId: home.threadRef.threadId,
      workflowRunId: home.workflowRunStatus.runId,
      action: "resume",
    });
  }, [backend, run.home]);

  const openConfig = useCallback(async () => {
    if (input.configPath === null) return;
    const result = await openInEditor(input.configPath);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "Could not open the config",
        description: input.configPath,
      });
    }
  }, [input.configPath, openInEditor]);

  // A live fact outranks the local "starting" marker; once the run shows, the marker is stale.
  const settledPending: RunTogglePending =
    pending === "starting" && run.home !== null ? null : pending;
  return { start, stop, retry, openConfig, pending: settledPending };
}
