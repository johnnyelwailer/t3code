/**
 * The thread details panel's "Move to": continues a started thread on another machine through
 * `runThreadHandoff` (capture → launch → verify → settle), wired to the existing environment
 * commands — `startTurn` with a bootstrap (one `launchThread` on the target), `interruptTurn`,
 * and the per-thread resource cleanup. Absent handler = the server cannot capture a handoff.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import {
  createT3TeamThreadHandoffCommands,
  runThreadHandoff,
  type ThreadHandoffSteps,
} from "@t3tools/client-runtime/state/thread-handoff";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";

import type { EnvironmentOption } from "~/components/BranchToolbar.logic";
import { toastManager } from "~/components/ui/toast";
import { connectionAtomRuntime } from "~/connection/runtime";
import { ensureLocalApi } from "~/localApi";
import { newThreadId } from "~/lib/utils";
import { useServerConfigs, useThreadShell } from "~/state/entities";
import { serverEnvironment } from "~/state/server";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { buildThreadRouteParams } from "~/threadRoutes";
import { awaitSuccessorLive, stopSuccessor } from "./t3team-threadHandoffSuccessorLive";
import { readServerFeatureFlagOr } from "~/t3team/t3team-useFeatureFlag";
import {
  announceThreadHandoff,
  handoffConfirmMessage,
  successorLaunchInput,
  unwrap,
  WAIT_FOR_TURN_CONFIRM_MESSAGE,
} from "./t3team-threadHandoffWeb";

export const threadHandoffCommands = createT3TeamThreadHandoffCommands(connectionAtomRuntime);

export function useT3TeamThreadHandoff(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  /** A started server thread: drafts re-target with "Run on" instead. */
  readonly enabled: boolean;
  readonly availableEnvironments: readonly EnvironmentOption[];
}): ((targetEnvironmentId: EnvironmentId) => void) | undefined {
  const { environmentId, threadId, availableEnvironments } = input;
  const navigate = useNavigate();
  const shell = useThreadShell(
    input.enabled && threadId !== null ? scopeThreadRef(environmentId, threadId) : null,
  );
  const serverConfig = useServerConfigs().get(environmentId);
  const supported =
    input.enabled &&
    shell !== null &&
    serverConfig?.environment.capabilities.t3team?.threadHandoff === true;
  const reapSupported = readServerFeatureFlagOr(
    serverConfig,
    "RESOURCE_PRESSURE",
    serverConfig?.resourcePressure === true,
  );
  const prepare = useAtomCommand(threadHandoffCommands.prepare, { reportFailure: false });
  const record = useAtomCommand(threadHandoffCommands.record, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interrupt = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const previewCleanup = useAtomCommand(serverEnvironment.previewThreadResourceCleanup, {
    reportFailure: false,
  });
  const cleanup = useAtomCommand(serverEnvironment.cleanupThreadResources, {
    reportFailure: false,
  });
  const busyRef = useRef(false);

  const handoff = useCallback(
    async (targetEnvironmentId: EnvironmentId) => {
      const target = availableEnvironments.find((env) => env.environmentId === targetEnvironmentId);
      if (shell === null || threadId === null || target === undefined || busyRef.current) return;
      const sourceLabel =
        availableEnvironments.find((env) => env.environmentId === environmentId)?.label ??
        "this machine";
      const targetProjectId = target.projectId;
      if (targetProjectId === null) {
        toastManager.add({
          type: "warning",
          title: `${target.label} doesn't have this project yet`,
          description: "Try again once the project shows up there.",
        });
        return;
      }
      const running = threadRuntimeIsActive(shell.runtime);
      const dialogs = ensureLocalApi().dialogs;
      const confirmed = await dialogs
        .confirm(
          handoffConfirmMessage({
            title: shell.title,
            sourceLabel,
            targetLabel: target.label,
            running,
          }),
        )
        .catch(() => false);
      const wait =
        !confirmed &&
        running &&
        (await dialogs.confirm(WAIT_FOR_TURN_CONFIRM_MESSAGE).catch(() => false));
      if (!confirmed && !wait) return;

      busyRef.current = true;
      const successorThreadId = newThreadId();
      const source = { environmentId, threadId, label: sourceLabel };
      const successor = {
        environmentId: targetEnvironmentId,
        threadId: successorThreadId,
        label: target.label,
      };
      const steps: ThreadHandoffSteps = {
        capture: async ({ waitForTurnEnd }) =>
          unwrap(await prepare({ environmentId, input: { threadId, waitForTurnEnd } })),
        launchSuccessor: async ({ capture, workspace, text }) => {
          unwrap(
            await startTurn({
              environmentId: targetEnvironmentId,
              input: successorLaunchInput({
                successorThreadId,
                projectId: targetProjectId,
                shell,
                capture,
                workspace,
                text,
              }),
            }),
          );
        },
        awaitSuccessorLive: () => awaitSuccessorLive(targetEnvironmentId, successorThreadId),
        stopSuccessor: () =>
          stopSuccessor(
            targetEnvironmentId,
            successorThreadId,
            async (runId) =>
              void unwrap(
                await interrupt({
                  environmentId: targetEnvironmentId,
                  input: { threadId: successorThreadId, runId },
                }),
              ),
          ),
        interruptSource: async (runId) =>
          void unwrap(await interrupt({ environmentId, input: { threadId, runId } })),
        record: async (recordEnvironmentId, recordInput) =>
          void unwrap(await record({ environmentId: recordEnvironmentId, input: recordInput })),
        ...(reapSupported
          ? {
              reapSource: async () => {
                const plan = unwrap(await previewCleanup({ environmentId, input: { threadId } }));
                unwrap(
                  await cleanup({
                    environmentId,
                    input: {
                      threadId,
                      targets: plan.targets.map(({ pid, startTimeMs }) => ({ pid, startTimeMs })),
                      stopAgentSession: plan.agentSession !== null,
                    },
                  }),
                );
              },
            }
          : {}),
      };
      try {
        const outcome = await runThreadHandoff({
          source,
          successor,
          turnMode: wait ? "wait" : "interrupt",
          steps,
        });
        announceThreadHandoff(outcome, target.label, () => {
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(targetEnvironmentId, successorThreadId)),
          });
        });
      } finally {
        busyRef.current = false;
      }
    },
    [
      availableEnvironments,
      cleanup,
      environmentId,
      interrupt,
      navigate,
      prepare,
      previewCleanup,
      reapSupported,
      record,
      shell,
      startTurn,
      threadId,
    ],
  );

  const onHandoff = useCallback(
    (targetEnvironmentId: EnvironmentId) => void handoff(targetEnvironmentId),
    [handoff],
  );
  return supported ? onHandoff : undefined;
}
