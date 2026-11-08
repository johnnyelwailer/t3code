/**
 * Test harness for the "Project ready" bound: the same per-tick sequence the app-level flusher
 * runs (track the connection, stamp the step, decide, apply) over the real draft store, with an
 * injected clock. No sleeps and no timers: a scenario is a list of (time, world) ticks.
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, type CloudSession } from "@t3tools/contracts";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  CLOUD_PROJECT_WAIT_BOUND_SECONDS,
  isCloudProjectWaitExpired,
  trackMachineConnectedSince,
} from "./t3team-cloudProjectWaitBound";
import {
  resetCloudProjectWaitLog,
  type CloudProjectWaitOutcomeLine,
} from "./t3team-cloudProjectWaitLog";
import type { CloudProjectWait, CloudProjectWaitReason } from "./t3team-cloudProjectWait";
import { applyCloudQueuedSendAction } from "./t3team-cloudQueuedSendActions";
import {
  decideCloudQueuedSendFlush,
  type CloudQueuedSendFlushAction,
} from "./t3team-cloudQueuedSendFlush";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  getDraftCloudQueuedSend,
  stampDraftCloudQueuedSendStep,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

export const ENV = EnvironmentId.make("env-cloud");
export const T0 = Date.parse("2026-10-13T08:00:00.000Z");
export const BOUND_MS = CLOUD_PROJECT_WAIT_BOUND_SECONDS * 1000;
export const HOUR = 3_600_000;

const waitFor = (reason: CloudProjectWaitReason): CloudProjectWait => ({
  reason,
  environmentId: ENV,
  expectedCwd: "/workspace/app",
  projectsSeen: 0,
  projectTitle: "app",
  machineProjectTitle: null,
});

export interface World {
  readonly phase?: CloudSession["phase"];
  readonly connected?: boolean;
  readonly projectId?: string | null;
  readonly reason?: CloudProjectWaitReason;
  readonly scratch?: boolean;
  readonly envEnded?: boolean;
}

/** One machine as this window sees it; `restart()` forgets what only memory held. */
export function flusher() {
  let seen = new Map<string, number>();
  const lines: CloudProjectWaitOutcomeLine[] = [];
  return {
    lines,
    restart: () => {
      seen = new Map();
    },
    tick(draftId: string, nowMs: number, world: World = {}): CloudQueuedSendFlushAction {
      const queued = getDraftCloudQueuedSend(draftId)!;
      const session = {
        sessionId: "session-9",
        phase: world.phase ?? "ready",
        environmentId: ENV,
      } as unknown as CloudSession;
      const connected = world.connected ?? true;
      const projectWait = world.projectId ? null : waitFor(world.reason ?? "project-list-pending");
      const connectedSince = trackMachineConnectedSince(seen, ENV, connected, nowMs);
      stampDraftCloudQueuedSendStep(
        draftId,
        {
          queued,
          session,
          machineConnected: connected,
          projectReady: !!world.projectId,
          projectWait,
        },
        new Date(nowMs),
      );
      const action = decideCloudQueuedSendFlush({
        queued,
        target: null,
        session,
        connectFailure: null,
        machineConnected: connected,
        projectId: world.projectId ? ProjectId.make(world.projectId) : null,
        scratch: world.scratch ?? false,
        threadExists: false,
        projectWait,
        projectWaitExpired: isCloudProjectWaitExpired(queued, connectedSince, nowMs),
        environmentSessionEnded: world.envEnded ?? false,
      });
      if (action.kind === "fail") {
        applyCloudQueuedSendAction(action, {
          draftId,
          queued,
          threadId: ThreadId.make(`thread-${draftId}`),
          projectCwd: null,
          requests: new Map(),
          draftPageOpen: true,
          connect: () => {},
          openScratchProject: async () => null,
          startTurn: (() => {}) as never,
          projectWaitLog: { nowMs, resolvedBy: null, sink: (line) => lines.push(line) },
        });
      }
      return action;
    },
  };
}

export function queueDraft(draftId: string, projectId = "project-a") {
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(
    scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make(projectId)),
    DraftId.make(draftId),
    { threadId: ThreadId.make(`thread-${draftId}`) },
  );
  store.setPrompt(DraftId.make(draftId), "deploy the preview");
  writeDraftCloudQueuedSend(
    draftId,
    decodeCloudQueuedSend({
      messageId: `msg-${draftId}`,
      messageText: "deploy the preview",
      outgoingText: "deploy the preview",
      titleSeed: "deploy the preview",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: "session-9",
      sessionLabel: "machine",
      createdAt: new Date(T0 - 600_000).toISOString(),
    })!,
  );
  store.setPrompt(DraftId.make(draftId), "");
}

export function resetDraftWorld() {
  resetCloudProjectWaitLog();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
}

export const kinds = (actions: ReadonlyArray<CloudQueuedSendFlushAction>) =>
  actions.map((a) => a.kind);
