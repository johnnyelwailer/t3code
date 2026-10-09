/**
 * What the `RunToggle` switch does (doc 07 §2.3): on starts the recipe through the sidecar host's
 * own thread-creating launch (the only launch path the route accepts); off stops the run, then
 * "stop including sub-runs" and the watch command on every open watch the run's threads hold;
 * retry re-drives a failed run; the pencil opens the config.
 */
import { CommandId, type EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import { randomUUID } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import { isRunActive, type RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { isWatchedOpenLink } from "~/state/t3team-watchedPullRequests.logic";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { stopThreadCascade } from "~/t3team/chat/t3team-useStopCascade";
import type { RunTogglePending } from "~/t3team/t3team-recipeRunToggleState";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

/** How long the card shows "Starting" on its own before the launch fact must have arrived. */
const STARTING_GRACE_MS = 20_000;
/** A launch fact stamped slightly before the click (server clock) still belongs to it. */
const LAUNCH_CLOCK_SKEW_MS = 60_000;

function failed(title: string, error: unknown, fallback: string) {
  toastManager.add({
    type: "error",
    title,
    description: error instanceof Error ? error.message : fallback,
  });
}

export function useRecipeRunToggleActions(input: {
  readonly recipe: T3TeamSidecarRecipeQuickStart | null;
  readonly host: SidecarSectionHost | null;
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
  const startedAtRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
    },
    [],
  );
  const { recipe, host, environmentId, run } = input;

  const start = useCallback(async () => {
    if (!recipe || !host) {
      toastManager.add({
        type: "warning",
        title: "Cannot start",
        description: "This recipe cannot be started from here.",
      });
      return;
    }
    setPending("starting");
    startedAtRef.current = Date.now();
    try {
      const launched = await host.launchQuickStart(recipe);
      if (!launched) throw new Error("This recipe has no workflow to run in this project.");
      // The launch fact flips the card to its live state; the timer only covers the gap.
      if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null;
        setPending((current) => (current === "starting" ? null : current));
      }, STARTING_GRACE_MS);
    } catch (error) {
      setPending(null);
      failed("Could not start", error, "The launch failed.");
    }
  }, [host, recipe]);

  const stop = useCallback(async () => {
    if (environmentId === null) return;
    setPending("stopping");
    try {
      const home = run.home;
      const status = home?.workflowRunStatus ?? null;
      if (home !== null && isRunActive(status)) {
        // A finished (failed) run has nothing left to stop; its watches still do.
        if (!backend?.controlWorkflow || !status?.runId) {
          throw new Error("This server cannot stop the run; its watches were left in place.");
        }
        await backend.controlWorkflow({
          threadId: home.threadRef.threadId,
          workflowRunId: status.runId,
          action: "stop",
        });
      }
      for (const watcher of run.watchThreads) {
        if (!isWatchedOpenLink(watcher.link)) continue;
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
      failed("Could not stop", error, "The stop failed.");
    } finally {
      setPending(null);
    }
  }, [backend, cascadeSupported, environmentId, run, stopCascade, watch]);

  const retry = useCallback(async () => {
    const home = run.home;
    if (!backend?.controlWorkflow || !home?.workflowRunStatus?.runId) return;
    try {
      await backend.controlWorkflow({
        threadId: home.threadRef.threadId,
        workflowRunId: home.workflowRunStatus.runId,
        action: "resume",
      });
    } catch (error) {
      failed("Could not retry", error, "The retry failed.");
    }
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

  // The local marker yields only to a live run launched after the click; an older, finished run
  // in the project is not proof that this launch arrived.
  const launchArrived =
    run.home !== null &&
    isRunActive(run.home.workflowRunStatus) &&
    Date.parse(run.home.launchedAt) >= (startedAtRef.current ?? 0) - LAUNCH_CLOCK_SKEW_MS;
  const settledPending: RunTogglePending = pending === "starting" && launchArrived ? null : pending;
  return { start, stop, retry, openConfig, pending: settledPending };
}
