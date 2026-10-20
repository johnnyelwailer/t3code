import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { AnyRouter } from "@tanstack/react-router";

import { newMessageId, newThreadId } from "~/lib/utils";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  readProjects,
  readThreadShell,
  readThreadShells,
  waitForThreadShell,
} from "~/state/entities";
import {
  createPrimaryEnvironmentOrchestrationApi,
  runOnPrimaryEnvironment,
} from "~/t3team/backend/t3team-orchestrationApi";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { threadEnvironment } from "~/state/threads";

import { pickVoiceHomeProject } from "./t3team-voiceHomeProject";
import type { VoiceSessionDeps } from "./t3team-voiceSession";
import { routeVoiceUtterance } from "./t3team-voiceRouting";
import { useVoiceThreadStore } from "./t3team-voiceThreadStore";

export function makeVoiceSessionDeps(router: AnyRouter): VoiceSessionDeps | null {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) return null;
  const orchestration = createPrimaryEnvironmentOrchestrationApi();
  const store = useVoiceThreadStore.getState();
  const openThreadProjectId = (): ProjectId | null => {
    const params = router.state.matches.at(-1)?.params ?? {};
    const target = resolveThreadRouteTarget(params);
    return target?.kind === "server"
      ? (readThreadShell(target.threadRef)?.projectId ?? null)
      : null;
  };
  return {
    threads: () => readThreadShells().filter((thread) => thread.environmentId === environmentId),
    home: () => useVoiceThreadStore.getState().homeByEnvironmentId[environmentId],
    remember: (home) => store.remember(environmentId, home),
    forget: () => store.forget(environmentId),
    homeProject: () =>
      pickVoiceHomeProject({
        openThreadProjectId: openThreadProjectId(),
        projectIds: readProjects()
          .filter((project) => project.environmentId === environmentId)
          .map((project) => project.id),
      }),
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
    waitForThread: async (threadId) => {
      await waitForThreadShell(scopeThreadRef(environmentId, threadId));
    },
    newThreadId,
    newMessageId,
    now: () => new Date().toISOString(),
  };
}
