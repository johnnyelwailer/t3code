import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { runAtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { newMessageId, newThreadId } from "~/lib/utils";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readThreadShells, waitForThreadShell } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import {
  createPrimaryEnvironmentOrchestrationApi,
  runOnPrimaryEnvironment,
} from "~/t3team/backend/t3team-orchestrationApi";
import { threadEnvironment } from "~/state/threads";

import type { VoiceSessionDeps } from "./t3team-voiceSession";
import { routeVoiceUtterance } from "./t3team-voiceRouting";
import { useVoiceThreadStore } from "./t3team-voiceThreadStore";

const projectlessProjectIds = new Map<EnvironmentId, ProjectId>();

/**
 * The environment's "No project" (scratch) project, found or created by the server. Resolved once
 * per environment; a failure is not cached so the next utterance retries.
 */
async function resolveProjectlessProject(environmentId: EnvironmentId): Promise<ProjectId | null> {
  const known = projectlessProjectIds.get(environmentId);
  if (known !== undefined) return known;
  const result = await runAtomCommand(
    appAtomRegistry,
    projectEnvironment.openScratch,
    { environmentId, input: {} },
    { label: "voice-thread-projectless", reportFailure: false },
  );
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  projectlessProjectIds.set(environmentId, result.value.id);
  return result.value.id;
}

export function makeVoiceSessionDeps(): VoiceSessionDeps | null {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) return null;
  const orchestration = createPrimaryEnvironmentOrchestrationApi();
  const store = useVoiceThreadStore.getState();
  return {
    threads: () => readThreadShells().filter((thread) => thread.environmentId === environmentId),
    home: () => useVoiceThreadStore.getState().homeByEnvironmentId[environmentId],
    remember: (home) => store.remember(environmentId, home),
    forget: () => store.forget(environmentId),
    projectlessProject: () => resolveProjectlessProject(environmentId),
    route: routeVoiceUtterance,
    startTurn: orchestration.startThreadTurn,
    pinAndKeep: async (threadId: ThreadId) => {
      await runOnPrimaryEnvironment(threadEnvironment.pin, { threadId }, "voice-thread-pin");
      await runOnPrimaryEnvironment(
        threadEnvironment.setAutoSettle,
        { threadId, enabled: false },
        "voice-thread-keep",
      );
    },
    release: async (threadId: ThreadId) => {
      await runOnPrimaryEnvironment(threadEnvironment.unpin, { threadId }, "voice-thread-unpin");
      await runOnPrimaryEnvironment(
        threadEnvironment.setAutoSettle,
        { threadId, enabled: true },
        "voice-thread-release",
      );
    },
    waitForThread: async (threadId) => {
      await waitForThreadShell(scopeThreadRef(environmentId, threadId));
    },
    newThreadId,
    newMessageId,
    now: () => new Date().toISOString(),
  };
}
